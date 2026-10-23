package com.healthkeep;

import static com.healthkeep.Models.*;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {
    private final AuthService auth;
    AuthController(AuthService auth) { this.auth=auth; }
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
    Tokens register(@Valid @RequestBody Register body) { return auth.register(body); }
    @PostMapping("/login") Tokens login(@Valid @RequestBody Login body) { return auth.login(body); }
    @PostMapping("/refresh") Tokens refresh(@Valid @RequestBody Refresh body) { return auth.refresh(body.refreshToken()); }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@AuthenticationPrincipal Jwt jwt) { auth.logout(UUID.fromString(jwt.getClaimAsString("sid"))); }
    @GetMapping("/me") User me(@AuthenticationPrincipal Jwt jwt) { return auth.me(UUID.fromString(jwt.getSubject())); }
}
