package com.healthkeep;

import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class Models {
    private Models() {}
    public enum Role { OWNER, EDITOR, VIEWER }
    public enum Kind { CONDITION, ALLERGY, MEDICATION, VISIT, APPOINTMENT, COVERAGE, NOTE }
    public record Register(@NotBlank @Email @Size(max=254) String email,
            @NotBlank @Size(min=12,max=72) String password,
            @NotBlank @Size(max=100) String displayName) {}
    public record Login(@NotBlank @Email @Size(max=254) String email,
            @NotBlank @Size(max=72) String password) {}
    public record Refresh(@NotBlank @Size(max=200) String refreshToken) {}
    public record User(UUID id, String email, String displayName) {}
    public record Tokens(String accessToken, String refreshToken, long expiresIn, User user) {}
    public record Patient(UUID id, String displayName, LocalDate birthDate, String bloodGroup,
            long version, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record PatientAccess(Patient patient, Role role) {}
    public record PatientInput(@NotBlank @Size(max=100) String displayName,
            @PastOrPresent LocalDate birthDate,
            @NotNull @Pattern(regexp="UNKNOWN|A[+-]|B[+-]|AB[+-]|O[+-]") String bloodGroup,
            @Positive Long version) {}
    public record Entry(UUID id, UUID patientId, Kind kind, String title, String details,
            String provider, OffsetDateTime occurredAt, long version,
            OffsetDateTime deletedAt, OffsetDateTime updatedAt) {}
    public record EntryInput(@NotNull Kind kind, @NotBlank @Size(max=200) String title,
            @NotNull @Size(max=4000) String details, @NotNull @Size(max=200) String provider,
            OffsetDateTime occurredAt, @Positive Long version) {}
    public record Grant(@NotBlank @Email @Size(max=254) String email, @NotNull Role role) {}
    public record Member(UUID userId, String email, String displayName, Role role) {}
    public record Event(long seq, String type, Map<String,Object> payload, OffsetDateTime createdAt) {}
    public record Sync(long cursor, boolean hasMore, List<Event> events) {}
}
