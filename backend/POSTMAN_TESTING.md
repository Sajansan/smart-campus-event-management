# Ordered Postman testing guide

Complete the README database/environment/admin setup first. Use a fresh student email and student ID. In Postman create variables:

- `baseUrl`: `http://localhost:5000`
- `studentToken`, `adminToken`, `eventId`: fill after the relevant responses.

For bodies choose **Body -> raw -> JSON** (`Content-Type: application/json`). For protected requests choose **Authorization -> Bearer Token** and the indicated variable. All responses contain `success` and `message`; resource/list responses also contain `data`. No password should appear in any response.

## 1. Student registration

**POST** `{{baseUrl}}/api/auth/register` — no authorization.

```json
{"studentId":"DBIT001","name":"John","email":"john@example.com","password":"password123"}
```

Expected **201**:

```json
{"success":true,"message":"Student account created successfully","data":{"id":1,"studentId":"DBIT001","name":"John","email":"john@example.com","role":"student"}}
```

IDs may differ. Repeating registration returns **409**; missing student ID, malformed email or a short password returns **400**. Adding `"role":"admin"` still creates a student.

## 2. Student login

**POST** `{{baseUrl}}/api/auth/login` — no authorization.

```json
{"email":"john@example.com","password":"password123"}
```

Expected **200**, `success: true`, message `Login successful`, a JWT in `token`, and safe account fields in `user`. Save `token` as `studentToken`. A wrong email/password returns **401**; missing fields or malformed email returns **400**.

## 3. Admin login

**POST** `{{baseUrl}}/api/auth/login` — no authorization.

```json
{"email":"YOUR_SEEDED_ADMIN_EMAIL","password":"YOUR_SEEDED_ADMIN_PASSWORD"}
```

Use the actual values supplied to `admin:create`. Expected **200**, JWT in `token`, and `user.role: "admin"`. Save `token` as `adminToken`.

## 4. Admin creates event

**POST** `{{baseUrl}}/api/events` — Bearer `{{adminToken}}`.

```json
{"title":"AI Workshop","description":"Introduction to AI","category":"Workshop","location":"Main Hall","eventDate":"2026-10-20","startTime":"09:00:00","endTime":"12:00:00","registrationDeadline":"2026-10-18 23:59:59","capacity":100}
```

Choose a future date/deadline if these example dates have passed. Expected **201**, message `Event created successfully`, event in `data` including its `id` and admin `created_by`. Save `data.id` as `eventId`. Student token returns **403**. Missing title/date, invalid dates, or negative capacity returns **400**.

## 5. Get all upcoming events

**GET** `{{baseUrl}}/api/events` — Bearer `{{studentToken}}` or `{{adminToken}}`. No body.

Expected **200**, message `Events retrieved successfully`, `data` array ordered by event date and start time, including the workshop. Optional filters:

- `{{baseUrl}}/api/events?search=workshop`
- `{{baseUrl}}/api/events?category=Workshop&date=2026-10-20`

Admins use `{{baseUrl}}/api/events?all=true` to include past events; students receive **403** for this option.

## 6. Get single event

**GET** `{{baseUrl}}/api/events/{{eventId}}` — Bearer `{{studentToken}}` or `{{adminToken}}`. No body.

Expected **200**, message `Event retrieved successfully`, workshop in `data`. A nonexistent positive ID returns **404**; malformed ID returns **400**.

## 7. Student registers for event

**POST** `{{baseUrl}}/api/registrations/{{eventId}}` — Bearer `{{studentToken}}`. No body required.

Expected **201**:

```json
{"success":true,"message":"Successfully registered for the event","data":{"id":1,"eventId":1,"studentId":1}}
```

`studentId` here is the internal user ID. Repeat returns **409**. A past/started event, expired deadline or full capacity returns **409**; nonexistent event returns **404**; admin token returns **403**. Submitted user IDs cannot change who is registered.

## 8. Student views own registrations

**GET** `{{baseUrl}}/api/registrations/my` — Bearer `{{studentToken}}`. No body.

Expected **200**, message `Your registrations retrieved successfully`, array in `data` with event `id`, `title`, `description`, `category`, `location`, `event_date`, `start_time`, `registration_id`, and `registered_at`.

## 9. Admin views event registrations

**GET** `{{baseUrl}}/api/registrations/event/{{eventId}}` — Bearer `{{adminToken}}`. No body.

Expected **200**, message `Registered students retrieved successfully`, array in `data` containing `registration_id`, `student_user_id`, `student_id` (DBIT ID), `name`, `email`, and `registered_at`. Student token returns **403**. An existing event with no registrations returns an empty array; nonexistent event returns **404**.

## 10. Admin updates event

**PUT** `{{baseUrl}}/api/events/{{eventId}}` — Bearer `{{adminToken}}`.

```json
{"title":"AI Workshop - Updated","location":"Computer Lab","capacity":120}
```

Expected **200**, message `Event updated successfully`, updated event in `data`; omitted fields keep their values. Student token returns **403**; nonexistent ID returns **404**.

## 11. Admin deletes event

**DELETE** `{{baseUrl}}/api/events/{{eventId}}` — Bearer `{{adminToken}}`. No body.

Expected **200**:

```json
{"success":true,"message":"Event deleted successfully"}
```

Repeat the event GET: **404**. Repeat own-registrations GET: deleted event is absent because registrations cascade on deletion. Repeat DELETE: **404**.

For any protected route, omit the token or use an invalid/expired token: expected **401**, `success: false`, and a safe error message.
