package com.healthkeep;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.*;

@Configuration
class SecurityConfig {
    @Bean PasswordEncoder passwords() { return new BCryptPasswordEncoder(12); }

    private SecretKeySpec key(String secret) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32)
            throw new IllegalArgumentException("JWT_SECRET must be at least 32 bytes");
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }
    @Bean JwtEncoder encoder(@Value("${healthkeep.jwt-secret}") String secret) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key(secret)));
    }
    @Bean JwtDecoder decoder(@Value("${healthkeep.jwt-secret}") String secret,
            @Value("${healthkeep.issuer}") String issuer, JdbcClient db) {
        var decoder = NimbusJwtDecoder.withSecretKey(key(secret)).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> session = jwt -> {
            try {
                boolean active = db.sql("""
                    SELECT EXISTS(SELECT 1 FROM auth_sessions WHERE id=:sid AND user_id=:uid
                      AND revoked_at IS NULL AND expires_at > now())
                    """).param("sid", UUID.fromString(jwt.getClaimAsString("sid")))
                    .param("uid", UUID.fromString(jwt.getSubject())).query(Boolean.class).single();
                if (active && jwt.getAudience().contains("healthkeep-api"))
                    return OAuth2TokenValidatorResult.success();
            } catch (IllegalArgumentException | NullPointerException ignored) { }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Session invalid", null));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), session));
        return decoder;
    }
    @Bean SecurityFilterChain security(HttpSecurity http, CorsConfigurationSource corsConfigurationSource) throws Exception {
        return http.cors(c -> c.configurationSource(corsConfigurationSource)).csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a.requestMatchers("/api/v1/auth/register", "/api/v1/auth/login",
                        "/api/v1/auth/refresh", "/actuator/health").permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(r -> r.jwt(Customizer.withDefaults()))
                .headers(h -> h.cacheControl(Customizer.withDefaults()))
                .build();
    }
    @Bean CorsConfigurationSource corsConfigurationSource(@Value("${healthkeep.cors-origins}") String origins) {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(origins.split(",")));
        config.setAllowedMethods(Arrays.asList("GET","POST","PUT","DELETE","OPTIONS"));
        config.setAllowedHeaders(Arrays.asList("Authorization","Content-Type","If-Match"));
        config.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
