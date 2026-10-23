# HealthKeep — Personal Health Record

โปรเจกต์เริ่มต้นที่รันได้ด้วย React Native Expo + TypeScript, Java 21 Spring Boot 4.1.1 และ PostgreSQL 17 พร้อม Flyway migrations, authentication และสิทธิ์ระดับผู้ป่วย

**ใช้ข้อมูลสมมติเท่านั้น** ไม่มีบัญชีเริ่มต้นหรือข้อมูลผู้ป่วยจริงถูกใส่ในฐานข้อมูล ปุ่ม “ลองด้วยข้อมูลสาธิต” สร้างข้อมูลสมมติในบัญชีที่ล็อกอินอยู่

## เริ่มรันบนเครื่องนี้

เปิดโฟลเดอร์นี้ด้วย VS Code แล้วใช้ Terminal ที่ root ของโปรเจกต์:

```powershell
.\scripts\init-local.ps1
docker compose up -d --build
cd mobile
npm ci
npm run web -- --max-workers 2
```

- แอปตัวอย่างบนเว็บ: http://localhost:8081
- API health: http://localhost:8080/actuator/health
- API prefix: http://localhost:8080/api/v1
- PostgreSQL: `localhost:15432` (ชื่อผู้ใช้/ฐานข้อมูลใน `.env`)
- `.env` ถูกสร้างด้วย random secrets และไม่ถูกเก็บใน Git สคริปต์ไม่เขียนทับไฟล์ที่มีอยู่
- Web เก็บ token เฉพาะหน่วยความจำ รีโหลดหน้าแล้วต้องล็อกอินใหม่

ต้องมี Docker Desktop (Linux containers), Node.js 24 LTS และ PowerShell 7 ส่วน Java 21 กับ Maven มีใน Docker image จึงไม่ต้องเปลี่ยน Java 17 ของเครื่อง ระบบดึง dependencies จากอินเทอร์เน็ตในการรันครั้งแรก

## ทดลองบน iOS / Android

```powershell
cd mobile
npm start
```

ใช้ development build ที่รองรับ Expo SDK 58 หรือ Expo Go รุ่นที่รองรับ SDK นี้ การรัน iOS simulator ต้องใช้ macOS; เครื่อง Windows นี้ใช้เว็บหรือโทรศัพท์จริงได้ และ Android emulator ต้องติดตั้ง Android Studio แยก

API URL เริ่มต้น: เว็บ/iOS simulator ใช้ `http://localhost:8080`, Android emulator ใช้ `http://10.0.2.2:8080` หากใช้โทรศัพท์จริง:

1. คัดลอก `mobile/.env.example` เป็น `mobile/.env` แล้วตั้ง `EXPO_PUBLIC_API_URL=http://<LAN-IP-ของคอมพิวเตอร์>:8080`
2. ตั้ง `API_BIND_ADDRESS=0.0.0.0` ใน root `.env` แล้วรัน `docker compose up -d api` ใหม่
3. ให้โทรศัพท์กับเครื่องอยู่เครือข่ายเดียวกัน และอนุญาตพอร์ตเฉพาะเครือข่ายทดสอบใน Windows Firewall
4. รีสตาร์ต Expo (`npm start -- --clear`) ตัวแปร `EXPO_PUBLIC_*` อยู่ในแอป ห้ามใส่ secrets

การเปิด API บน LAN มีไว้ทดสอบด้วยข้อมูลสมมติเท่านั้น ค่าเริ่มต้น bind เฉพาะ localhost ระบบใช้งานจริงต้องมี HTTPS

## Flow ที่ทำได้

- สมัครบัญชีและเข้าสู่ระบบ (รหัสผ่านอย่างน้อย 12 ตัวอักษร, ไม่เกิน 72 UTF-8 bytes)
- Access JWT อายุ 15 นาที; refresh token แบบสุ่ม อายุรวม 30 วัน หมุนทุกครั้งและเก็บเฉพาะ hash ในฐานข้อมูล
- Logout ยกเลิก session และทำให้ access JWT ของ session นั้นใช้ต่อไม่ได้
- เพิ่ม/แก้โปรไฟล์หลายผู้ป่วย: ชื่อ วันเกิด กรุ๊ปเลือด
- เพิ่ม/แก้/ลบบันทึก 7 ประเภท: โรคประจำตัว แพ้ยา ยา พบแพทย์ นัดหมาย สิทธิ์รักษา และบันทึกทั่วไป
- สิทธิ์รักษามีชื่อสิทธิ์/ประกัน รายละเอียด และโรงพยาบาลในเครือข่าย สามารถบันทึกประกันสังคมเป็นประเภทนี้ได้
- เจ้าของแชร์สิทธิ์ `VIEWER` / `EDITOR` ให้บัญชีที่สมัครแล้ว และถอนสิทธิ์ได้จากแอป
- Cloud Sync แบบ online-first: ดึง event cursor ทุก 20 วินาที เมื่อแอปกลับ foreground หรือกดรีเฟรช มี tombstone สำหรับรายการที่ลบและป้องกันการเขียนทับด้วย version
- Token บน native เก็บ refresh ใน SecureStore; access และข้อมูลสุขภาพอยู่ในหน่วยความจำ ไม่มี PHI ใน localStorage หรือ AsyncStorage

## ทดสอบ

```powershell
# HTTP integration tests: Spring Boot + PostgreSQL จริงในฐานทดสอบแยก
docker compose --profile test run --build --rm api-tests

cd mobile
npm run typecheck
npm run lint
npm run export:web
npx expo export --platform all --max-workers 2
npx expo install --check
```

Integration tests ใช้ข้อมูลสังเคราะห์และ PostgreSQL แยกผ่าน `db-test` ไม่มีการล้างฐานข้อมูลแอป ดูผลที่ตรวจจริงใน [docs/verification.md](docs/verification.md)

ถ้าต้องรัน backend นอก Docker ให้ติดตั้ง JDK 21 ตั้ง `JAVA_HOME` แล้วกำหนด `DATABASE_URL=jdbc:postgresql://localhost:15432/healthkeep`, `DATABASE_USER`, `DATABASE_PASSWORD`, `JWT_SECRET` จาก root `.env` ก่อนรัน `backend/mvnw.cmd spring-boot:run` Maven wrapper ดาวน์โหลด Maven ให้เอง

## โครงสร้าง

```text
backend/              Java 21 API, security, services, SQL migrations, integration tests
mobile/               Expo iOS/Android/Web, TypeScript, Thai UI, API and sync client
docs/openapi.json     OpenAPI 3 contract สำหรับ import ใน Swagger Editor / Postman
docs/architecture.md ERD, authorization, sync semantics, decisions
docs/wireframes.md   หน้าจอและเส้นทางการใช้งาน
scripts/              เตรียม local secrets
compose.yaml          PostgreSQL, API และฐานข้อมูล/runner สำหรับทดสอบ
```

## ขอบเขตของรุ่นเริ่มต้น

รายละเอียด assistant ในบทสนทนาอ้างอิงอ่านกลับมาได้เฉพาะ content-reference จึงสร้างแบบจำลองใหม่จากข้อกำหนดที่ผู้ใช้ระบุ ไม่สามารถยืนยันว่าตรง ERD/API เดิมทุกจุดได้ บันทึกแต่ละประเภทใช้ `health_records` ร่วมกันแทนตารางแยก และใช้ email ของบัญชีที่มีอยู่เพื่อแชร์สิทธิ์ โดยไม่มีการส่งอีเมล

ผล audit ล่าสุดยังมี dependency entries ระดับ high 18 รายการ (ไม่มี critical) อ่านรายละเอียดและข้อจำกัดใน [รายงานทดสอบ](docs/verification.md) ก่อนนำไปต่อยอดใช้งานจริง

ยังไม่มี offline write queue, push notification, upload เอกสาร, OCR, การเชื่อมโรงพยาบาล/บริษัทประกัน, ยืนยันอีเมล, reset password, MFA, account/patient deletion หรือ ownership transfer การลบบันทึกเป็น soft delete และ event เก่ายังอยู่ในฐานข้อมูล ต้องออกแบบ retention และการลบถาวรก่อนใช้ข้อมูลจริง

ก่อนเปิดใช้งานกับข้อมูลจริง ยังต้องมี security/privacy review, HTTPS, secret management, centralized rate limiting, audit trail สำหรับการอ่าน/เปลี่ยนสิทธิ์, backup/restore ที่ทดสอบแล้ว, monitoring และกระบวนการจัดการข้อมูลส่วนบุคคล เอกสารนี้ไม่กล่าวอ้างว่าระบบผ่านมาตรฐานหรือข้อกำหนดทางกฎหมายแล้ว

## หยุดและกลับมาทำต่อ

```powershell
docker compose stop
# เปิดอีกครั้ง (ข้อมูลแอปคงอยู่ใน Docker volume)
docker compose up -d
```

อย่าใช้ `docker compose down -v` หากต้องการเก็บข้อมูลที่ทดลองไว้

เอกสารทางการที่ใช้: [Expo TypeScript](https://docs.expo.dev/guides/typescript/), [Expo project setup](https://docs.expo.dev/get-started/create-a-project/), [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html), [Spring Security JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
