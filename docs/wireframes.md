# UI and working flows

The Thai Expo UI adapts to narrow screens and desktop web. This is the same React Native codebase, not a separate web mock.

```text
AUTH                              HEALTH SPACE
┌───────────────────────────┐     ┌────────────────────────────────────┐
│ HealthKeep +              │     │ HealthKeep +           User / Exit │
│ สุขภาพของคุณ เก็บไว้ใกล้ตัว │     ├─────────────┬──────────────────────┤
│ Email                     │     │ Overview    │ Health notebook      │
│ Password                  │     │ Records     │ Patient chips / Add  │
│ [Sign in]                 │     │ Appointments│ Patient profile      │
│ Create a trial account    │     │ Coverage    │ Blood group          │
│ Synthetic data notice     │     │ Access      │ Counts / Next visit  │
└───────────────────────────┘     │             │ Recent records       │
                                  └─────────────┴──────────────────────┘
```

On phones, navigation becomes a horizontal tab strip and the profile stacks vertically. Records are cards, with category, title, details, provider, and local date/time. All edits open a keyboard-aware modal; deletion asks for a second explicit confirmation. A viewer sees details without save/delete controls. Server authorization remains authoritative.

1. Create account → empty patient space → create a patient or click synthetic demo.
2. Select patient → overview → edit demographics / blood group.
3. Open records → filter category → add, edit or delete a record.
4. Open appointments → enter local ISO date/time (converted to an offset-bearing UTC instant for the API).
5. Open coverage → record policy, social security entitlement and fictional hospital/network in title/details/provider.
6. Owner opens access → enter an already registered account's email → VIEWER or EDITOR → save or revoke.
7. Another signed-in device receives committed changes on refresh, foreground or 20-second polling.

Empty, loading, network failure, validation, unauthorized role and stale-version states have explicit UI text. No push reminder or hospital lookup is implied by the appointments/coverage screens.
