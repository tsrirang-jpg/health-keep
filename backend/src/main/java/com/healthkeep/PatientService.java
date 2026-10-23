package com.healthkeep;

import static com.healthkeep.Models.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class PatientService {
    private final JdbcClient db;
    private final JsonMapper json = JsonMapper.builder().build();
    public PatientService(JdbcClient db) { this.db=db; }

    public List<PatientAccess> list(UUID uid) {
        return db.sql("""
            SELECT p.*,a.role FROM patients p JOIN patient_access a ON a.patient_id=p.id
            WHERE a.user_id=:uid ORDER BY p.created_at,p.id
            """).param("uid",uid).query((r,n) -> new PatientAccess(patientRow(r), Role.valueOf(r.getString("role")))).list();
    }
    private Patient patientRow(ResultSet r) throws SQLException {
        return new Patient(r.getObject("id",UUID.class),r.getString("display_name"),
            r.getObject("birth_date",LocalDate.class),r.getString("blood_group"),r.getLong("version"),
            r.getObject("created_at",OffsetDateTime.class),r.getObject("updated_at",OffsetDateTime.class));
    }
    private Role access(UUID patient,UUID uid,boolean write,boolean owner) {
        var role=db.sql("SELECT role FROM patient_access WHERE patient_id=:pid AND user_id=:uid")
            .param("pid",patient).param("uid",uid).query(String.class).optional().map(Role::valueOf)
            .orElseThrow(ApiErrors::missing);
        if ((owner && role!=Role.OWNER) || (write && role==Role.VIEWER))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Your role does not allow this action");
        return role;
    }
    // All patient writes, including membership changes, take this same lock first.
    private void lock(UUID id) {
        db.sql("SELECT id FROM patients WHERE id=:id FOR UPDATE").param("id",id)
            .query(UUID.class).optional().orElseThrow(ApiErrors::missing);
    }
    public PatientAccess get(UUID id,UUID uid) {
        Role role=access(id,uid,false,false);
        return new PatientAccess(patient(id),role);
    }
    private Patient patient(UUID id) {
        return db.sql("SELECT * FROM patients WHERE id=:id").param("id",id).query(Patient.class).single();
    }
    @Transactional
    public PatientAccess create(UUID uid,PatientInput input) {
        UUID id=UUID.randomUUID();
        db.sql("INSERT INTO patients(id,display_name,birth_date,blood_group) VALUES(:id,:name,:birth,:blood)")
            .param("id",id).param("name",input.displayName().trim()).param("birth",input.birthDate())
            .param("blood",input.bloodGroup()).update();
        db.sql("INSERT INTO patient_access(patient_id,user_id,role) VALUES(:id,:uid,'OWNER')")
            .param("id",id).param("uid",uid).update();
        var result=patient(id);
        event(id,"patient.created",result);
        return new PatientAccess(result,Role.OWNER);
    }
    @Transactional
    public PatientAccess update(UUID id,UUID uid,PatientInput input) {
        lock(id); Role role=access(id,uid,true,false);
        if (input.version()==null) throw ApiErrors.invalid("version is required for updates");
        int updated=db.sql("""
            UPDATE patients SET display_name=:name,birth_date=:birth,blood_group=:blood,
            version=version+1,updated_at=now() WHERE id=:id AND version=:version
            """).param("id",id).param("name",input.displayName().trim()).param("birth",input.birthDate())
            .param("blood",input.bloodGroup()).param("version",input.version()).update();
        if (updated!=1) throw ApiErrors.conflict();
        var result=patient(id); event(id,"patient.updated",result);
        return new PatientAccess(result,role);
    }
    public List<Entry> entries(UUID id,UUID uid) {
        access(id,uid,false,false);
        return db.sql("SELECT * FROM health_records WHERE patient_id=:id AND deleted_at IS NULL ORDER BY updated_at DESC,id")
            .param("id",id).query(Entry.class).list();
    }
    private Entry entry(UUID patient,UUID id) {
        return db.sql("SELECT * FROM health_records WHERE id=:id AND patient_id=:pid AND deleted_at IS NULL")
            .param("id",id).param("pid",patient).query(Entry.class).optional().orElseThrow(ApiErrors::missing);
    }
    public Entry getEntry(UUID patient,UUID id,UUID uid) {
        access(patient,uid,false,false); return entry(patient,id);
    }
    private void validateEntry(EntryInput input) {
        if (input.kind()==Kind.APPOINTMENT && input.occurredAt()==null)
            throw ApiErrors.invalid("occurredAt is required for an appointment");
    }
    @Transactional
    public Entry createEntry(UUID patient,UUID uid,EntryInput input) {
        lock(patient); access(patient,uid,true,false); validateEntry(input);
        UUID id=UUID.randomUUID();
        db.sql("""
            INSERT INTO health_records(id,patient_id,kind,title,details,provider,occurred_at)
            VALUES(:id,:pid,:kind,:title,:details,:provider,:at)
            """).param("id",id).param("pid",patient).param("kind",input.kind().name())
            .param("title",input.title().trim()).param("details",input.details()).param("provider",input.provider())
            .param("at",input.occurredAt()).update();
        var result=entry(patient,id); event(patient,"record.created",result); return result;
    }
    @Transactional
    public Entry updateEntry(UUID patient,UUID id,UUID uid,EntryInput input) {
        lock(patient); access(patient,uid,true,false); validateEntry(input);
        entry(patient,id);
        if (input.version()==null) throw ApiErrors.invalid("version is required for updates");
        int updated=db.sql("""
            UPDATE health_records SET kind=:kind,title=:title,details=:details,provider=:provider,
            occurred_at=:at,version=version+1,updated_at=now()
            WHERE id=:id AND patient_id=:pid AND version=:version AND deleted_at IS NULL
            """).param("id",id).param("pid",patient).param("kind",input.kind().name())
            .param("title",input.title().trim()).param("details",input.details()).param("provider",input.provider())
            .param("at",input.occurredAt()).param("version",input.version()).update();
        if (updated!=1) throw ApiErrors.conflict();
        var result=entry(patient,id); event(patient,"record.updated",result); return result;
    }
    @Transactional
    public void deleteEntry(UUID patient,UUID id,UUID uid,long version) {
        lock(patient); access(patient,uid,true,false); entry(patient,id);
        var removed=db.sql("""
            UPDATE health_records SET deleted_at=now(),updated_at=now(),version=version+1
            WHERE id=:id AND patient_id=:pid AND version=:version AND deleted_at IS NULL RETURNING *
            """).param("id",id).param("pid",patient).param("version",version).query(Entry.class).optional()
            .orElseThrow(ApiErrors::conflict);
        event(patient,"record.deleted",removed);
    }
    private void event(UUID patient,String type,Object payload) {
        long seq=db.sql("UPDATE patients SET change_seq=change_seq+1 WHERE id=:id RETURNING change_seq")
            .param("id",patient).query(Long.class).single();
        db.sql("INSERT INTO sync_events(patient_id,seq,type,payload) VALUES(:id,:seq,:type,CAST(:payload AS jsonb))")
            .param("id",patient).param("seq",seq).param("type",type).param("payload",json.writeValueAsString(payload)).update();
    }
    @SuppressWarnings("unchecked")
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Sync sync(UUID patient,UUID uid,long cursor) {
        access(patient,uid,false,false);
        long head=db.sql("SELECT change_seq FROM patients WHERE id=:id").param("id",patient).query(Long.class).single();
        if (cursor<0 || cursor>head) throw ApiErrors.invalid("Invalid sync cursor");
        List<Event> events=db.sql("""
            SELECT seq,type,payload,created_at FROM sync_events WHERE patient_id=:id AND seq>:cursor
            ORDER BY seq LIMIT 100
            """).param("id",patient).param("cursor",cursor).query((r,n)->new Event(r.getLong("seq"),r.getString("type"),
                json.readValue(r.getString("payload"),Map.class),r.getObject("created_at",OffsetDateTime.class))).list();
        long next=events.isEmpty()?cursor:events.getLast().seq();
        return new Sync(next,next<head,events);
    }
    public List<Member> members(UUID patient,UUID uid) {
        access(patient,uid,false,true);
        return db.sql("""
            SELECT u.id AS user_id,u.email,u.display_name,a.role FROM patient_access a
            JOIN app_users u ON u.id=a.user_id WHERE a.patient_id=:pid ORDER BY u.email
            """).param("pid",patient).query(Member.class).list();
    }
    @Transactional
    public void grant(UUID patient,UUID uid,Grant grant) {
        lock(patient); access(patient,uid,false,true);
        if (grant.role()==Role.OWNER) throw ApiErrors.invalid("Ownership transfer is not supported");
        UUID target=db.sql("SELECT id FROM app_users WHERE email=:email")
            .param("email",grant.email().trim().toLowerCase(Locale.ROOT)).query(UUID.class).optional()
            .orElseThrow(()->ApiErrors.invalid("This account must register before access can be granted"));
        if (target.equals(uid)) throw ApiErrors.invalid("Cannot change the owner's role");
        db.sql("""
            INSERT INTO patient_access(patient_id,user_id,role) VALUES(:pid,:uid,:role)
            ON CONFLICT(patient_id,user_id) DO UPDATE SET role=EXCLUDED.role
            """).param("pid",patient).param("uid",target).param("role",grant.role().name()).update();
    }
    @Transactional
    public void revoke(UUID patient,UUID uid,UUID target) {
        lock(patient); access(patient,uid,false,true);
        if (uid.equals(target)) throw ApiErrors.invalid("Cannot remove the owner");
        db.sql("DELETE FROM patient_access WHERE patient_id=:pid AND user_id=:uid")
            .param("pid",patient).param("uid",target).update();
    }
}
