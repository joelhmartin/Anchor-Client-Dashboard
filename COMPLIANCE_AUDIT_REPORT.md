# HIPAA, SOC 2, and Security Compliance Audit Report

**Anchor Client Dashboard**
**Audit Date:** January 28, 2026
**Prepared For:** Compliance Review
**Classification:** CONFIDENTIAL

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Compliance Status Overview](#compliance-status-overview)
3. [Critical Findings](#critical-findings)
4. [Authentication & Access Control](#authentication--access-control)
5. [PHI/PII Data Protection](#phipii-data-protection)
6. [Encryption Assessment](#encryption-assessment)
7. [Audit Logging & Monitoring](#audit-logging--monitoring)
8. [API & Transmission Security](#api--transmission-security)
9. [Third-Party Integrations](#third-party-integrations)
10. [Session Management](#session-management)
11. [Remediation Roadmap](#remediation-roadmap)
12. [BAA Status](#baa-status)

---

## Executive Summary

This comprehensive compliance audit evaluated the Anchor Client Dashboard application against HIPAA Security Rule requirements (45 CFR Part 164), SOC 2 Trust Service Criteria, and industry security best practices.

### Overall Assessment: **NON-COMPLIANT - Critical Issues Present**

| Framework | Status | Risk Level |
|-----------|--------|------------|
| HIPAA Security Rule | ❌ Non-Compliant | **CRITICAL** |
| SOC 2 Type II | ⚠️ Partial Compliance | **HIGH** |
| OWASP Top 10 | ⚠️ Mostly Compliant | **MEDIUM** |

### Key Statistics

- **Critical Issues:** 12
- **High-Priority Issues:** 18
- **Medium-Priority Issues:** 15
- **Estimated Remediation Effort:** 300-400 hours

### Top 5 Critical Findings

1. **No PHI Encryption at Rest** - Form submissions marked as PHI use fake encryption (`Buffer.from()`)
2. **No KMS Integration** - No key management system for encryption keys
3. **OAuth Users Bypass MFA** - Google/Microsoft login skips multi-factor authentication
4. **Audit Logs Not Immutable** - Security logs can be modified/deleted
5. **Third-Party PHI Transmission** - Call transcripts sent to Google Vertex AI without BAA

---

## Compliance Status Overview

### HIPAA Security Rule Compliance

| Requirement | Section | Status | Finding |
|-------------|---------|--------|---------|
| Access Controls | § 164.312(a)(1) | ⚠️ Partial | RBAC implemented but no session concurrency limits |
| Audit Controls | § 164.312(b) | ⚠️ Partial | Logging exists but no admin visibility, not immutable |
| Integrity Controls | § 164.312(c)(1) | ❌ Fail | No data integrity verification for PHI |
| Person Authentication | § 164.312(d) | ⚠️ Partial | MFA exists but OAuth users bypass it |
| Transmission Security | § 164.312(e)(1) | ⚠️ Partial | HTTPS enforced but missing HSTS header |
| Encryption | § 164.312(a)(2)(iv) | ❌ **FAIL** | PHI not encrypted at rest |
| Emergency Access | § 164.312(a)(2)(ii) | ❌ Fail | No emergency access procedures |
| Automatic Logoff | § 164.312(a)(2)(iii) | ✅ Pass | 15-min access token, 30-day refresh |

### SOC 2 Trust Service Criteria

| Category | Criteria | Status | Notes |
|----------|----------|--------|-------|
| Security | CC6.1 | ⚠️ Partial | Strong auth but gaps in MFA enforcement |
| Security | CC6.6 | ⚠️ Partial | Network security good, missing HSTS |
| Security | CC6.7 | ✅ Pass | Input validation with Zod schemas |
| Availability | A1.1 | ⚠️ Partial | No documented disaster recovery |
| Confidentiality | C1.1 | ❌ Fail | PHI not encrypted, inadequate access controls |
| Processing Integrity | PI1.1 | ⚠️ Partial | Audit logging incomplete |
| Privacy | P1.1 | ⚠️ Partial | Data retention policies missing |

---

## Critical Findings

### CRITICAL-001: PHI Encryption Not Implemented

**Severity:** CRITICAL
**HIPAA Reference:** § 164.312(a)(2)(iv)
**Location:** `server/routes/formsPublic.js:467`

```javascript
// CURRENT (VULNERABLE)
const payloadValue = isIntake
  ? Buffer.from(JSON.stringify(payload)) // TODO: Encrypt with KMS
  : payload;
```

**Issue:** The code comments indicate encryption should be implemented, but `Buffer.from()` is NOT encryption - it's trivial to decode.

**Impact:** All intake form PHI (patient names, medical history, symptoms) stored in plaintext.

**Remediation Required:**
```javascript
import { KeyManagementServiceClient } from '@google-cloud/kms';

async function encryptPHI(plaintext) {
  const kmsClient = new KeyManagementServiceClient();
  const [result] = await kmsClient.encrypt({
    name: process.env.KMS_KEY_NAME,
    plaintext: Buffer.from(JSON.stringify(plaintext))
  });
  return result.ciphertext;
}
```

---

### CRITICAL-002: OAuth Users Skip MFA Entirely

**Severity:** CRITICAL
**HIPAA Reference:** § 164.308(a)(5)(ii)(C)
**Location:** `server/services/security/mfa.js:132-142`

```javascript
// CURRENT (VULNERABLE)
if (authProvider === 'google' || authProvider === 'microsoft') {
  const settings = await getMfaSettings(userId);
  if (settings.requireMfaAlways) {
    return { required: true, reason: MfaTriggerReasons.ALWAYS_REQUIRED };
  }
  return { required: false, reason: null };  // BYPASSES MFA
}
```

**Impact:** If a user's Google/Microsoft account is compromised, attacker gains full access to PHI.

**Remediation:** Require MFA for all users regardless of auth provider, especially on new devices/locations.

---

### CRITICAL-003: Session IP Validation Missing

**Severity:** CRITICAL
**HIPAA Reference:** § 164.312(a)(2)(ii)
**Location:** `server/services/security/sessions.js:159-237`

**Issue:** Refresh token validation does not check if IP address has changed significantly.

**Impact:** If refresh token is stolen, attacker can use it from any IP address worldwide.

**Remediation:** Add IP consistency validation and require re-authentication on significant IP changes.

---

### CRITICAL-004: No Password History/Reuse Prevention

**Severity:** CRITICAL
**HIPAA Reference:** § 164.308(a)(5)(ii)(E)
**Location:** `server/services/security/passwordPolicy.js`

**Issue:** Users can reuse the same password indefinitely. No password history tracking.

**Compliance Requirement:** HIPAA requires password management procedures to prevent reuse.

**Remediation:** Add `password_history` table and validate against last 24 passwords.

---

### CRITICAL-005: Audit Logs Not Immutable

**Severity:** CRITICAL
**HIPAA Reference:** § 164.312(b)
**SOC 2 Reference:** A1.2
**Location:** `server/services/security/audit.js:114-140`

**Issue:** Audit logs stored in regular database table with no tamper protection.

**Impact:** Attacker with database access can delete evidence of breach.

**Remediation:**
1. Implement append-only table with deletion triggers
2. Send logs to external SIEM system
3. Add cryptographic log chaining (hash each record with previous)

---

### CRITICAL-006: Call Transcripts Sent to Google Without BAA

**Severity:** CRITICAL
**HIPAA Reference:** § 164.502(e)
**Location:** `server/services/ctm.js:341-348`

```javascript
// PHI sent to Vertex AI
const raw = await generateAiResponse({
  prompt: `${transcript ? 'Caller transcript:\n' : 'Form content:\n'}
           ${content.slice(0, 6000)}`,  // Full medical conversation
  // ...
});
```

**Issue:** Call transcripts containing patient health information sent to Google Vertex AI for classification.

**Impact:** PHI transmitted to third party without documented Business Associate Agreement.

**Remediation:**
1. Verify BAA exists with Google Cloud for AI/ML services
2. Implement PHI redaction before sending to AI
3. Consider on-premise classification model

---

### CRITICAL-007: Document AI Processes Medical Forms Unencrypted

**Severity:** CRITICAL
**HIPAA Reference:** § 164.312(e)(1)
**Location:** `server/services/docai.js:173-187`

**Issue:** Medical intake forms (PDFs with PHI) sent to Google Document AI for OCR processing.

**Impact:** PHI transmitted to cloud service; no encryption beyond TLS.

**Remediation:** Verify Google Cloud BAA covers Document AI, implement audit logging for all document processing.

---

### CRITICAL-008: API Credentials Stored in Plaintext

**Severity:** CRITICAL
**SOC 2 Reference:** CC6.1
**Locations:**
- `ctm_api_secret` in `client_profiles` table
- OAuth tokens in `oauth_connections` table
- Monday.com token in `app_settings` table

**Issue:** Sensitive API credentials stored without encryption.

**Impact:** Database breach exposes all third-party service credentials.

**Remediation:** Use Google Secret Manager or AWS Secrets Manager for credential storage.

---

## Authentication & Access Control

### Strengths ✅

| Component | Implementation | Status |
|-----------|----------------|--------|
| Password Hashing | Argon2id with strong parameters | Excellent |
| JWT Tokens | Short-lived (15 min) with refresh rotation | Good |
| Session Management | DB-backed sessions with device fingerprinting | Good |
| Rate Limiting | Per-IP and per-user limiting on login | Good |
| Account Lockout | 30-min lockout after 5 failures | Compliant |
| RBAC | Roles: superadmin, admin, team, client | Implemented |

### Gaps & Vulnerabilities ⚠️

| Issue | Severity | Location | HIPAA/SOC 2 |
|-------|----------|----------|-------------|
| No password history check | Critical | passwordPolicy.js | § 164.308(a)(5)(ii)(E) |
| No password expiration | High | passwordPolicy.js | § 164.308(a)(5)(ii)(E) |
| OAuth skips MFA | Critical | mfa.js:132 | § 164.308(a)(5)(ii)(C) |
| No token device binding | Critical | tokens.js:43-56 | § 164.312(a)(2)(ii) |
| HS256 instead of RS256 | Medium | tokens.js:54 | CC6.1.3 |
| No session concurrency limits | Medium | sessions.js | § 164.308(a)(1)(ii) |
| 90-day session lifetime | High | sessions.js:17 | CC6.1.1 |
| Small common password list | High | passwordPolicy.js:27 | CC6.1.2 |
| Permissive device fingerprint | Medium | deviceFingerprint.js:115 | CC6.1.2 |
| No admin unlock endpoint | Medium | rateLimit.js | § 164.308(a)(1)(ii) |

### Recommended Actions

1. **Immediate:** Implement MFA for OAuth users on new devices
2. **Week 1:** Add password history tracking (24 password minimum)
3. **Week 2:** Implement token device/IP binding
4. **Week 3:** Add password expiration policy (90 days recommended)
5. **Month 2:** Migrate to RS256 for JWT signing

---

## PHI/PII Data Protection

### Data Inventory

| Table | PHI/PII Fields | Encrypted | Status |
|-------|----------------|-----------|--------|
| `users` | first_name, last_name, email | ❌ No | Non-compliant |
| `client_profiles` | admin_name, admin_email, admin_phone | ❌ No | Non-compliant |
| `form_submissions` | encrypted_payload (intake forms) | ❌ **Fake** | CRITICAL |
| `call_logs` | from_number, meta (transcripts) | ❌ No | CRITICAL |
| `email_logs` | recipient_email, text_body, html_body | ❌ No | Non-compliant |
| `client_journeys` | client_name, phone, email, symptoms | ❌ No | CRITICAL |
| `active_clients` | client_name, email, phone | ❌ No | Non-compliant |

### Data Flow Analysis

```
User Input → Form Submission → "Encryption" (Buffer.from) → Database (Plaintext)
                                    ↓
Call Data → CTM API → Vertex AI (Classification) → Database (Plaintext)
                                    ↓
Documents → Document AI (OCR) → Form Builder → Database (Plaintext)
```

**Critical Issue:** At no point in the data flow is PHI actually encrypted.

### Minimum Necessary Standard Violations

| Area | Violation | Location |
|------|-----------|----------|
| Form submissions | All admin users can view all submissions | forms.js:454-487 |
| Call transcripts | Full transcripts stored, no redaction | ctm.js:164-172 |
| Email logs | Full email body logged indefinitely | mailgun.js:43-80 |
| AI classification | Full transcripts sent to external AI | ctm.js:341-348 |

### Required Remediations

1. **Implement AES-256-GCM encryption** for all PHI at rest
2. **Integrate Google Cloud KMS** for key management
3. **Add ownership-based access controls** for form submissions
4. **Implement PHI redaction** before sending to external services
5. **Add data classification** system to identify PHI fields

---

## Encryption Assessment

### Encryption at Rest

| Component | Required | Implemented | Gap |
|-----------|----------|-------------|-----|
| Intake form PHI | AES-256 | Buffer.from() | ❌ CRITICAL |
| Draft sessions | AES-256 | Buffer.from() | ❌ CRITICAL |
| Call transcripts | AES-256 | None | ❌ CRITICAL |
| Email contents | AES-256 | None | ❌ High |
| OAuth tokens | AES-256 | None | ❌ High |
| API credentials | AES-256 | None | ❌ Critical |

### Encryption in Transit

| Component | Required | Implemented | Status |
|-----------|----------|-------------|--------|
| HTTPS | TLS 1.2+ | Yes (Express) | ✅ Pass |
| HSTS Header | Required | Missing | ⚠️ Gap |
| Secure Cookies | Required | Yes (prod) | ✅ Pass |
| API Authentication | Bearer tokens | Yes | ✅ Pass |

### Key Management

| Requirement | Status | Notes |
|-------------|--------|-------|
| KMS Integration | ❌ Not Implemented | TODO comments in code |
| Key Rotation | ❌ Not Implemented | No mechanism |
| Key Access Logging | ❌ Not Implemented | No audit trail |
| Emergency Key Access | ❌ Not Implemented | No procedures |

---

## Audit Logging & Monitoring

### Current Implementation ✅

| Event Type | Logged | Location |
|------------|--------|----------|
| Login success/failure | ✅ | security_audit_log |
| MFA challenges | ✅ | security_audit_log |
| Session events | ✅ | security_audit_log |
| Password changes | ✅ | security_audit_log |
| Account lockouts | ✅ | security_audit_log |
| Form creation/update | ✅ | form_audit_logs |
| Impersonation | ✅ | security_audit_log |

### Critical Gaps ❌

| Requirement | Status | Impact |
|-------------|--------|--------|
| Admin viewing security logs | ❌ No endpoint | Cannot review for compliance |
| Automated log retention | ❌ Function defined, not called | Logs grow unbounded |
| Log immutability | ❌ Regular table | Can be tampered |
| Real-time alerting | ❌ Not implemented | Delayed breach detection |
| Task change history | ❌ Not tracked | Cannot audit PHI access |
| PHI access logging | ❌ Incomplete | Cannot demonstrate compliance |
| Error logging to database | ❌ Console only | No correlation with audits |

### Required Remediations

1. **Add `/api/hub/security-logs` endpoint** for admin visibility
2. **Implement cron job** for `cleanup_old_audit_logs()` function
3. **Add log integrity protection** (hash chaining or external SIEM)
4. **Create `task_history` table** for complete audit trail
5. **Implement real-time security alerting** for failed login spikes

---

## API & Transmission Security

### Security Controls ✅

| Control | Status | Notes |
|---------|--------|-------|
| Parameterized SQL queries | ✅ Excellent | No SQL injection vulnerabilities |
| Zod input validation | ✅ Good | Comprehensive schema validation |
| CORS configuration | ✅ Good | Allowlist-based, credentials enabled |
| CSP headers | ✅ Good | Route-specific policies |
| Cookie security | ✅ Excellent | httpOnly, secure, sameSite |
| Rate limiting | ✅ Good | Per-IP and per-user |
| Bearer token auth | ✅ Good | All protected endpoints require auth |

### Vulnerabilities Found ⚠️

| Issue | Severity | Location |
|-------|----------|----------|
| Missing HSTS header | High | index.js:121-127 |
| Unprotected JSON.parse | Critical | hub.js:1305 |
| XSS in form success message | Critical | formsPublic.js:390 |
| dangerouslySetInnerHTML | High | AdminHub.jsx:2888 |
| No Content-Type validation | Medium | index.js:118 |
| postMessage wildcard origin | Medium | formsPublic.js:698 |
| Webhook signature bypass in dev | Medium | webhooks.js:21-22 |

### Required Fixes

1. **Add HSTS header:**
```javascript
helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } })
```

2. **Fix JSON.parse vulnerability:**
```javascript
const deletions = req.body.deletions
  ? (() => { try { return JSON.parse(req.body.deletions); } catch { return []; } })()
  : [];
```

3. **Sanitize form success message:**
```javascript
// Replace innerHTML with textContent or DOM API
document.body.textContent = result.message || 'Thank you!';
```

---

## Third-Party Integrations

### Integration Risk Assessment

| Service | BAA Required | BAA Status | PHI Transmitted | Risk Level |
|---------|--------------|------------|-----------------|------------|
| Google Cloud (Vertex AI) | Yes | ⚠️ Verify | Call transcripts | **CRITICAL** |
| Google Cloud (Document AI) | Yes | ⚠️ Verify | Medical forms | **CRITICAL** |
| Mailgun | Yes | ⚠️ User has BAA | Email with PHI | HIGH |
| CallTrackingMetrics | Yes | ⚠️ User has BAA | Call recordings | HIGH |
| Monday.com | Yes | ⚠️ User has BAA | Task data (potential PHI) | MEDIUM |
| Looker | Depends | Unknown | Analytics data | MEDIUM |

### Data Transmitted to Third Parties

| Service | Data Shared | Encryption |
|---------|-------------|------------|
| Google Vertex AI | Full call transcripts (6000 chars) | TLS only |
| Google Document AI | Full PDF documents | TLS only |
| Mailgun | Email addresses, full email bodies | TLS only |
| CTM | Caller names, phone numbers, locations | TLS + Basic Auth |
| Monday.com | Client identifiers, status, due dates | TLS + Bearer |

### Critical Issues

1. **Vertex AI Safety Filters Disabled:**
```javascript
// ai.js:95-99 - DANGEROUS
safetySettings: [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  // All categories set to BLOCK_NONE
]
```

2. **Credentials in Plaintext Database:**
   - `ctm_api_secret` - client_profiles table
   - OAuth access/refresh tokens - oauth_connections table
   - Monday.com token - app_settings table

3. **No Field-Level Filtering:**
   - Full form submissions sent to CTM
   - Full transcripts sent to AI classification
   - All fields extracted by Document AI

---

## Session Management

### Current Implementation

| Feature | Implementation | Status |
|---------|----------------|--------|
| Access token lifetime | 15 minutes | ✅ Good |
| Refresh token lifetime | 30 days | ✅ Acceptable |
| Absolute session limit | 90 days | ⚠️ Too long for PHI |
| Token rotation | On refresh | ✅ Good |
| Token family tracking | Reuse detection | ✅ Excellent |
| Device fingerprinting | Implemented | ✅ Good |
| Session revocation | DB-backed | ✅ Good |
| Activity tracking | last_activity_at | ✅ Good |

### Gaps

| Issue | Current | Recommended | Impact |
|-------|---------|-------------|--------|
| Absolute session lifetime | 90 days | 7-14 days | Reduces exposure window |
| Concurrent sessions | Unlimited | 5 maximum | Prevents session sprawl |
| IP validation on refresh | None | Required | Prevents token theft abuse |
| Session activity timeout | None | 30 minutes | HIPAA workstation security |

---

## Remediation Roadmap

### Phase 1: Critical Issues (Weeks 1-2)

| Task | Effort | Priority |
|------|--------|----------|
| Implement AES-256-GCM encryption for intake forms | 40 hours | P0 |
| Integrate Google Cloud KMS | 20 hours | P0 |
| Fix OAuth MFA bypass | 4 hours | P0 |
| Add HSTS header | 1 hour | P0 |
| Fix JSON.parse vulnerability | 2 hours | P0 |
| Fix XSS in form success message | 1 hour | P0 |
| Verify Google Cloud BAAs | 4 hours | P0 |

### Phase 2: High-Priority Issues (Weeks 3-4)

| Task | Effort | Priority |
|------|--------|----------|
| Add password history tracking | 8 hours | P1 |
| Implement token device/IP binding | 12 hours | P1 |
| Add admin security logs endpoint | 8 hours | P1 |
| Encrypt OAuth tokens at rest | 6 hours | P1 |
| Encrypt API credentials (CTM, Monday) | 6 hours | P1 |
| Implement audit log retention cron | 4 hours | P1 |
| Add session concurrency limits | 6 hours | P1 |

### Phase 3: Medium-Priority Hardening (Weeks 5-8)

| Task | Effort | Priority |
|------|--------|----------|
| Password expiration policy | 6 hours | P2 |
| Real-time security alerting | 16 hours | P2 |
| Task change history tracking | 16 hours | P2 |
| Distributed rate limiting (Redis) | 8 hours | P2 |
| Content-Type validation middleware | 2 hours | P2 |
| Sanitize dangerouslySetInnerHTML | 4 hours | P2 |
| Update common password dictionary | 2 hours | P2 |
| PHI redaction for AI classification | 20 hours | P2 |

### Phase 4: Long-Term Improvements (Months 2-3)

| Task | Effort | Priority |
|------|--------|----------|
| Migrate JWT to RS256 | 16 hours | P3 |
| Implement TOTP/WebAuthn MFA | 40 hours | P3 |
| Add log integrity (hash chaining) | 16 hours | P3 |
| Implement field-level encryption | 40 hours | P3 |
| Document disaster recovery procedures | 20 hours | P3 |
| Implement backup MFA delivery (SMS) | 16 hours | P3 |

---

## BAA Status

### Business Associate Agreements Required

Based on PHI transmission analysis, the following BAAs are **REQUIRED** for HIPAA compliance:

| Vendor | Service | PHI Type | BAA Status |
|--------|---------|----------|------------|
| Google Cloud | Vertex AI | Call transcripts, symptoms | ⚠️ **VERIFY** |
| Google Cloud | Document AI | Medical intake forms | ⚠️ **VERIFY** |
| Google Workspace | Cloud Run hosting | Application data | ✅ User confirmed |
| Mailgun | Email service | Patient communications | ⚠️ Need to verify coverage |
| CallTrackingMetrics | Call tracking | Caller information | ✅ User confirmed |
| Monday.com | Task management | Client case data | ✅ User confirmed |
| Looker | Analytics | Aggregated metrics | Depends on data |

### Action Items

1. **Verify Google Cloud BAA** includes Vertex AI and Document AI services
2. **Review Mailgun BAA** to confirm email content coverage
3. **Document all BAAs** in central compliance repository
4. **Implement BAA tracking** in application settings

---

## Appendix A: HIPAA Security Rule Mapping

| Section | Requirement | Status | Evidence |
|---------|-------------|--------|----------|
| § 164.308(a)(1) | Security Management Process | ⚠️ Partial | Risk analysis incomplete |
| § 164.308(a)(2) | Assigned Security Responsibility | N/A | Organizational |
| § 164.308(a)(3) | Workforce Security | N/A | Organizational |
| § 164.308(a)(4) | Information Access Management | ⚠️ Partial | RBAC implemented |
| § 164.308(a)(5) | Security Awareness and Training | N/A | Organizational |
| § 164.308(a)(6) | Security Incident Procedures | ❌ Missing | No incident response |
| § 164.308(a)(7) | Contingency Plan | ❌ Missing | No DR plan |
| § 164.308(a)(8) | Evaluation | N/A | This audit |
| § 164.310(a)(1) | Facility Access Controls | N/A | Cloud Run managed |
| § 164.310(b) | Workstation Use | N/A | Organizational |
| § 164.310(c) | Workstation Security | N/A | Organizational |
| § 164.310(d)(1) | Device and Media Controls | ⚠️ Partial | File uploads ephemeral |
| § 164.312(a)(1) | Access Control | ⚠️ Partial | See authentication section |
| § 164.312(b) | Audit Controls | ⚠️ Partial | See logging section |
| § 164.312(c)(1) | Integrity | ❌ Fail | No PHI integrity verification |
| § 164.312(d) | Person Authentication | ⚠️ Partial | MFA incomplete |
| § 164.312(e)(1) | Transmission Security | ⚠️ Partial | Missing HSTS |

---

## Appendix B: File References

| Issue | File | Line(s) |
|-------|------|---------|
| Fake PHI encryption | server/routes/formsPublic.js | 467, 547 |
| OAuth MFA bypass | server/services/security/mfa.js | 132-142 |
| No token binding | server/services/security/tokens.js | 43-56 |
| Session IP validation | server/services/security/sessions.js | 159-237 |
| Password policy gaps | server/services/security/passwordPolicy.js | 27-43 |
| Audit log storage | server/services/security/audit.js | 114-140 |
| Call transcript to AI | server/services/ctm.js | 341-348 |
| Document AI PHI | server/services/docai.js | 173-187 |
| JSON.parse vulnerability | server/routes/hub.js | 1305 |
| XSS vulnerability | server/routes/formsPublic.js | 390 |
| HSTS missing | server/index.js | 121-127 |
| Credentials plaintext | server/sql/init.sql | 88-89 |

---

## Appendix C: Compliance Checklist

### Before Production with PHI

- [ ] All intake form PHI encrypted with AES-256-GCM
- [ ] Google Cloud KMS integrated with key rotation
- [ ] OAuth users required to complete MFA on new devices
- [ ] Password history tracking enabled (24 passwords)
- [ ] HSTS header added to all responses
- [ ] JSON.parse vulnerability fixed
- [ ] XSS in form success message fixed
- [ ] Google Cloud BAAs verified for AI/ML services
- [ ] Admin security logs endpoint created
- [ ] Audit log retention cron job running
- [ ] API credentials encrypted in database

### Before SOC 2 Audit

- [ ] All checklist items above completed
- [ ] Session concurrency limits implemented
- [ ] Password expiration policy enforced
- [ ] Real-time security alerting operational
- [ ] Task change history fully tracked
- [ ] Log integrity protection implemented
- [ ] Incident response procedures documented
- [ ] Disaster recovery plan documented
- [ ] All BAAs documented and accessible
- [ ] Annual risk assessment completed

---

**Report Generated:** January 28, 2026
**Next Review Date:** April 28, 2026
**Report Classification:** CONFIDENTIAL - Internal Use Only

---

*This report was generated through automated code analysis and should be verified by qualified compliance professionals before making compliance attestations.*
