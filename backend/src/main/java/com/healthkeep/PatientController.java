package com.healthkeep;

import static com.healthkeep.Models.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/patients")
class PatientController {
    private final PatientService patients;
    PatientController(PatientService patients) { this.patients=patients; }
    private UUID uid(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    @GetMapping List<PatientAccess> list(@AuthenticationPrincipal Jwt jwt) { return patients.list(uid(jwt)); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    PatientAccess create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody PatientInput body) {
        return patients.create(uid(jwt),body);
    }
    @GetMapping("/{id}") PatientAccess get(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) {
        return patients.get(id,uid(jwt));
    }
    @PutMapping("/{id}") PatientAccess update(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody PatientInput body) { return patients.update(id,uid(jwt),body); }
    @GetMapping("/{id}/records") List<Entry> entries(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) {
        return patients.entries(id,uid(jwt));
    }
    @GetMapping("/{id}/records/{recordId}") Entry entry(@PathVariable UUID id,@PathVariable UUID recordId,
            @AuthenticationPrincipal Jwt jwt) { return patients.getEntry(id,recordId,uid(jwt)); }
    @PostMapping("/{id}/records") @ResponseStatus(HttpStatus.CREATED)
    Entry createEntry(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody EntryInput body) {
        return patients.createEntry(id,uid(jwt),body);
    }
    @PutMapping("/{id}/records/{recordId}") Entry updateEntry(@PathVariable UUID id,@PathVariable UUID recordId,
            @AuthenticationPrincipal Jwt jwt,@Valid @RequestBody EntryInput body) {
        return patients.updateEntry(id,recordId,uid(jwt),body);
    }
    @DeleteMapping("/{id}/records/{recordId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteEntry(@PathVariable UUID id,@PathVariable UUID recordId,@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("If-Match") long version) { patients.deleteEntry(id,recordId,uid(jwt),version); }
    @GetMapping("/{id}/sync") Sync sync(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") long cursor) { return patients.sync(id,uid(jwt),cursor); }
    @GetMapping("/{id}/members") List<Member> members(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt) {
        return patients.members(id,uid(jwt));
    }
    @PostMapping("/{id}/members") @ResponseStatus(HttpStatus.NO_CONTENT)
    void grant(@PathVariable UUID id,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Grant body) {
        patients.grant(id,uid(jwt),body);
    }
    @DeleteMapping("/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID id,@PathVariable UUID userId,@AuthenticationPrincipal Jwt jwt) {
        patients.revoke(id,uid(jwt),userId);
    }
}
