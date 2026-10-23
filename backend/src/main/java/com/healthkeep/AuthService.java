package com.healthkeep;

import static com.healthkeep.Models.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final JdbcClient db;
    private final PasswordEncoder passwords;
    private final JwtEncoder encoder;
    private final String issuer;
    private final String dummyHash;
    private final SecureRandom random = new SecureRandom();
    public AuthService(JdbcClient db, PasswordEncoder passwords, JwtEncoder encoder,
            @Value("${healthkeep.issuer}") String issuer) {
        this.db=db; this.passwords=passwords; this.encoder=encoder; this.issuer=issuer;
        this.dummyHash=passwords.encode(UUID.randomUUID().toString());
    }
    private String email(String value) { return value.trim().toLowerCase(Locale.ROOT); }
    private void passwordLength(String value) {
        if (value.getBytes(StandardCharsets.UTF_8).length > 72)
            throw ApiErrors.invalid("Password must not exceed 72 UTF-8 bytes");
    }
    @Transactional
    public Tokens register(Register body) {
        passwordLength(body.password());
        if (db.sql("SELECT count(*) FROM app_users WHERE email=:email").param("email",email(body.email()))
                .query(Long.class).single() > 0) throw ApiErrors.conflict();
        var user = new User(UUID.randomUUID(), email(body.email()), body.displayName().trim());
        db.sql("INSERT INTO app_users(id,email,display_name,password_hash) VALUES(:id,:email,:name,:hash)")
                .param("id",user.id()).param("email",user.email()).param("name",user.displayName())
                .param("hash",passwords.encode(body.password())).update();
        return newSession(user);
    }
    @Transactional
    public Tokens login(Login body) {
        passwordLength(body.password());
        var user = db.sql("SELECT id,email,display_name FROM app_users WHERE email=:email")
                .param("email",email(body.email())).query(User.class).optional();
        String hash = user.map(u -> db.sql("SELECT password_hash FROM app_users WHERE id=:id")
                .param("id",u.id()).query(String.class).single()).orElse(dummyHash);
        boolean matches = passwords.matches(body.password(),hash);
        if (!matches || user.isEmpty()) throw ApiErrors.unauthorized();
        return newSession(user.get());
    }
    private Tokens newSession(User user) {
        UUID sid=UUID.randomUUID();
        String token=randomToken();
        db.sql("""
                INSERT INTO auth_sessions(id,user_id,refresh_hash,expires_at)
                VALUES(:id,:uid,:hash,now()+interval '30 days')
                """).param("id",sid).param("uid",user.id()).param("hash",hash(token)).update();
        return tokens(user,sid,token);
    }
    @Transactional
    public Tokens refresh(String token) {
        var sid=db.sql("""
                SELECT id FROM auth_sessions WHERE refresh_hash=:hash AND revoked_at IS NULL
                AND expires_at>now() FOR UPDATE
                """).param("hash",hash(token)).query(UUID.class).optional().orElseThrow(ApiErrors::unauthorized);
        var user=db.sql("""
                SELECT u.id,u.email,u.display_name FROM app_users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.id=:id
                """).param("id",sid).query(User.class).single();
        String next=randomToken();
        db.sql("UPDATE auth_sessions SET refresh_hash=:hash WHERE id=:id")
                .param("hash",hash(next)).param("id",sid).update();
        return tokens(user,sid,next);
    }
    @Transactional
    public void logout(UUID sid) {
        db.sql("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id").param("id",sid).update();
    }
    public User me(UUID id) {
        return db.sql("SELECT id,email,display_name FROM app_users WHERE id=:id")
                .param("id",id).query(User.class).single();
    }
    private Tokens tokens(User user,UUID sid,String refresh) {
        var now=Instant.now();
        var claims=JwtClaimsSet.builder().issuer(issuer).subject(user.id().toString())
                .audience(List.of("healthkeep-api")).issuedAt(now).expiresAt(now.plusSeconds(900))
                .claim("sid",sid.toString()).build();
        var access=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
        return new Tokens(access,refresh,900,user);
    }
    private String randomToken() {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
