# Pharma System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [User Actions](#user-actions)
3. [Database Schema](#database-schema)
4. [Data Flow by Action](#data-flow-by-action)
5. [Entity Relationships](#entity-relationships)
6. [Configuration & Credits](#configuration--credits)
7. [API Endpoints](#api-endpoints)
8. [Video Player Event Tracking](#video-player-event-tracking)
9. [Key Differences from Audio/Video](#key-differences-from-audiovideo)

---

## System Overview

The TRL Pharma System allows users to interact with pharmaceutical training videos through six primary actions:
- **Queue**: Add pharma to a waiting list (no cost)
- **Dequeue**: Remove pharma from the waiting list
- **Rent**: Temporarily access pharma video for a configurable period (typically 14 days)
- **Renew**: Extend the rental period for already-rented pharma
- **Return**: Return advanced rental (cancel pre-purchased renewal)
- **Play/Pause**: Track video playback events and position

### Core Components
- **Pharma Entity**: Represents the pharmaceutical video catalog
- **Pharma User Status**: Tracks the relationship between users and pharmas (queued/rented)
- **Pharma User Videoplayer Position**: Tracks playback progress for resume functionality
- **Pharma Review**: User ratings and reviews
- **User Activity Log**: Records all user actions with metadata

### Important Notes
- **No Bookshelf/Keep Action**: Unlike audio, pharma content cannot be permanently purchased
- **Rental-Only Model**: All pharma access is time-limited through rentals
- **Advanced Renewal System**: Supports pre-purchasing renewals before current rental expires

---

## User Actions

### 1. QUEUE Action

**Purpose**: Add a pharma video to the user's waiting list for future access.

**API Endpoint**: `POST /user-pharmas/:id/actions/queue`

**Service Method**: `PharmaUserStatusService.queue(pharmaId, user)`

**Credit Cost**: 0 (Free action)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_statuses` | INSERT | `id`, `pharma_id`, `user_id`, `status`, `created_at`, `updated_at` | ULID, pharmaId, user.id, 'queued', NOW(), NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, pharmaId, 'pharma', 'queue', `{credit_used: 0}`, NOW() |

**Validation Rules**:
- Pharma must exist and be active (`is_active` = true)
- User cannot already have this pharma in any status (queued/rented)

**Response**: Returns success message

**Example Flow**:
```
User clicks "Add to Queue" → API call → Check if pharma exists →
Check if user already has this pharma → Create pharma_user_statuses record →
Log activity → Return success
```

---

### 2. DEQUEUE Action

**Purpose**: Remove a pharma video from the user's waiting list.

**API Endpoint**: `POST /user-pharmas/:id/actions/dequeue`

**Service Method**: `PharmaUserStatusService.dequeue(pharmaId, user)`

**Credit Cost**: 0

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_statuses` | DELETE | WHERE `user_id` = user.id AND `pharma_id` = pharmaId AND `status` = 'queued' | - |

**Validation Rules**:
- Pharma must exist in the user's queue (status = 'queued')
- Must belong to the requesting user

**Response**: Returns success message

**Example Flow**:
```
User clicks "Remove from Queue" → API call → Find queued pharma →
Delete pharma_user_statuses record → Return success
```

---

### 3. RENT Action

**Purpose**: Rent a pharma video for a limited time period (typically 14 days).

**API Endpoint**: `POST /user-pharmas/:id/actions/rent`

**Service Method**: `PharmaUserStatusService.rent(pharmaId, user)`

**Credit Cost**: Configurable (default: 1 credit from `pharma_rental_credit_cost` config)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_statuses` | INSERT or UPDATE | `id`, `pharma_id`, `user_id`, `status`, `rental_start_at`, `current_rental_expire_at`, `next_rental_expire_at`, `updated_at` | ULID, pharmaId, user.id, 'rented', NOW(), NOW() + rental_period, NULL, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, pharmaId, 'pharma', 'rent', `{credit_used, start_time, end_time}`, NOW() |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Validation Rules**:
- Pharma must be active (`is_active` = true)
- User cannot already have this pharma with status 'rented'
- Company must have sufficient credits

**Activity Log Meta Structure**:
```json
{
  "credit_used": 1,
  "start_time": "2026-01-12T10:00:00Z",
  "end_time": "2026-01-26T10:00:00Z"
}
```

**Response**: Returns success message

**Example Flow**:
```
User clicks "Rent" → API call → Check pharma is active →
Check user doesn't have active rental → Check company credits →
Create/update pharma_user_statuses → Deduct credits →
Log activity → Return success
```

---

### 4. RENEW Action

**Purpose**: Extend the rental period for an already-rented pharma video.

**API Endpoint**: `POST /user-pharmas/:id/actions/renew`

**Service Method**: `PharmaUserStatusService.renew(pharmaId, user)`

**Credit Cost**: Configurable (default: 1 credit from `pharma_rental_credit_cost` config)

**Advanced Renewal Logic**:

The pharma system uses a sophisticated two-tier renewal system with `current_rental_expire_at` and `next_rental_expire_at`:

#### **Scenario 1: Current rental valid, no next rental**
- Situation: User has active rental, hasn't pre-purchased renewal
- Action: Set `next_rental_expire_at` = `current_rental_expire_at` + rental_period
- Result: Pre-purchase next rental period

#### **Scenario 2: Current rental expired, next rental valid**
- Situation: Current period ended, but next period was pre-purchased
- Action:
  - Move `next_rental_expire_at` to `current_rental_expire_at`
  - Extend `next_rental_expire_at` by rental_period
- Result: Advance to next period and pre-purchase another renewal

#### **Scenario 3: Both expired, no next rental**
- Situation: Rental fully lapsed
- Action: Reset `current_rental_expire_at` = NOW() + rental_period
- Result: Start fresh rental

#### **Scenario 4: Already extended (both exist and next > current)**
- Situation: User already has advanced rental queued
- Action: Prevent renewal
- Result: Error - cannot renew when already extended

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_statuses` | UPDATE | `current_rental_expire_at`, `next_rental_expire_at`, `updated_at` | (based on scenario above), NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, pharmaId, 'pharma', 'renew', `{credit_used, start_time, end_time}`, NOW() |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Validation Rules**:
- Pharma must have `status` = 'rented' for the user
- Company must have sufficient credits
- Cannot renew if already extended (next_rental exists and > current_rental)

**Activity Log Meta Structure**:
```json
{
  "credit_used": 1,
  "start_time": "2026-01-26T10:00:00Z",
  "end_time": "2026-02-09T10:00:00Z"
}
```

**Response**: Returns success message

**Example Flow**:
```
User clicks "Renew" → API call → Find rented pharma → Check renewal state →
Apply appropriate renewal logic → Update expiration dates →
Deduct credits → Log activity → Return success
```

---

### 5. RETURN Action

**Purpose**: Cancel a pre-purchased advanced renewal (returns the "next" rental).

**API Endpoint**: `POST /user-pharmas/:id/actions/return`

**Service Method**: `PharmaUserStatusService.return(pharmaId, user)`

**Credit Cost**: 0 (No refund of rental credits)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_statuses` | UPDATE | `next_rental_expire_at`, `updated_at` | NULL, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, pharmaId, 'pharma', 'return', `{credit_used: 0}`, NOW() |

**Validation Rules**:
- Pharma must have `status` = 'rented' for the user
- Must have `next_rental_expire_at` set (must have advanced rental to return)
- Current rental must still be valid (`current_rental_expire_at` >= NOW())
- Must belong to the requesting user

**Important**: This action only cancels the **advanced/next rental**, not the current active rental. It allows users to cancel a pre-purchased renewal without losing their current access.

**Response**: Returns success message

**Example Flow**:
```
User clicks "Return Advanced Rental" → API call → Find rented pharma →
Verify next_rental exists → Verify current rental still valid →
Clear next_rental_expire_at → Log activity → Return success
```

---

### 6. PLAY/PAUSE Actions

**Purpose**: Track video playback events, position, and duration.

**API Endpoints**:
- `POST /pharmas/:id/trigger-event/play`
- `POST /pharmas/:id/trigger-event/pause`

**Service Method**: `PharmaService.triggerVideoPlayerEvent(pharmaId, user, dto)`

**Request Body**:
```typescript
{
  play_position: number  // Current position in seconds (>= 0)
}
```

**Credit Cost**: 0

---

#### PLAY Event

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_activity_logs` | INSERT or UPDATE | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at`, `updated_at` | user.id, pharmaId, 'pharma', 'play', `{start_position, end_position, total_time_played}`, NOW(), NOW() |
| `pharmas` | UPDATE | `total_played` | INCREMENT by 1 |

**Logic**:
1. Check if rental is valid (current or next rental not expired)
2. Look for existing PLAY activity log for today (DATE matching)
3. If exists for today:
   - Update `start_position` (keep minimum value)
   - Update `end_position` (keep maximum value)
   - Recalculate `total_time_played`
4. If no activity for today:
   - Create new PLAY log with `start_position` = play_position
   - Set `total_time_played` = 0 initially
5. Increment pharma's `total_played` counter

**Tracking**: Daily play activity with position metrics

---

#### PAUSE Event

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `pharma_user_videoplayer_positions` | INSERT or UPDATE | `id`, `pharma_id`, `user_id`, `play_position`, `updated_at` | (auto or existing), pharmaId, user.id, play_position, NOW() |
| `user_activity_logs` | UPDATE | `meta` (end_position, total_time_played), `updated_at` | (recalculated), NOW() |

**Logic**:
1. Check if rental is valid
2. Save/update videoplayer position:
   - If record exists: update `play_position` and `updated_at`
   - If not exists: create new record
3. Update latest PLAY activity log:
   - Find today's PLAY record for this user/pharma
   - Update `end_position` = max(meta.end_position, play_position)
   - Recalculate `total_time_played` = end_position - start_position

**Tracking**: Persistent playback position for resume capability

---

**Validation Rules**:
- Pharma must have active rental (current or next rental not expired)
- play_position must be >= 0

**Response**: Returns success message

**Example Flow (Play)**:
```
User clicks play → API call → Verify rental valid →
Check for today's play log → Update or create log →
Increment total_played counter → Return success
```

**Example Flow (Pause)**:
```
User pauses video → API call → Verify rental valid →
Save play position → Update activity log with end position →
Calculate total time played → Return success
```

---

## Database Schema

### Table: `pharmas`

**Purpose**: Stores pharmaceutical training video catalog data.

**Primary Key**: `id` (VARCHAR 34) - ULID format: `pharma_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(34) | NO | - | Primary key (ULID) |
| `sku` | VARCHAR | YES | NULL | Stock Keeping Unit, unique identifier |
| `title` | VARCHAR | NO | - | Pharma video title |
| `description` | TEXT | YES | NULL | Detailed description |
| `image_url` | VARCHAR | YES | NULL | Thumbnail/cover image URL |
| `video_url` | VARCHAR | YES | NULL | Video file URL |
| `categories` | JSONB | YES | [] | Array of category IDs |
| `runtime` | VARCHAR | YES | NULL | Video duration string |
| `total_played` | BIGINT | NO | 0 | Cumulative play count |
| `is_active` | BOOLEAN | NO | true | Active/inactive flag |
| `is_featured` | BOOLEAN | NO | false | Featured in catalog |
| `avg_rating` | FLOAT | NO | 0 | Average user rating |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `deleted_at` | TIMESTAMP | YES | NULL | Soft delete timestamp |

**Indexes**:
- `IDX_PHARMAS_SKU` (UNIQUE on `sku`)
- `IDX_PHARMAS_IS_ACTIVE` (on `is_active`)

**Foreign Keys**: None (standalone table)

**Modified By Actions**:
- **PLAY**: `total_played` incremented

---

### Table: `pharma_user_statuses`

**Purpose**: Junction table tracking the relationship between users and pharmas (queued/rented).

**Primary Key**: `id` (VARCHAR 45) - ULID format: `pharma_user_status_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(45) | NO | - | Primary key (ULID) |
| `pharma_id` | VARCHAR | NO | - | FK to pharmas table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `status` | ENUM | NO | 'queued' | 'queued', 'rented' |
| `rental_start_at` | TIMESTAMP | YES | NULL | When rental began |
| `current_rental_expire_at` | TIMESTAMP | YES | NULL | Current rental expiration |
| `next_rental_expire_at` | TIMESTAMP | YES | NULL | Advanced renewal expiration |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`pharma_id`, `user_id`) - One status per user-pharma pair

**Indexes**:
- `IDX_PHARMA_USER_STATUSES_PHARMA_ID` (on `pharma_id`)
- `IDX_PHARMA_USER_STATUSES_USER_ID` (on `user_id`)

**Foreign Keys**:
- `pharma_id` → `pharmas.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with status='queued'
- **DEQUEUE**: DELETE where status='queued'
- **RENT**: INSERT/UPDATE with status='rented', sets rental dates
- **RENEW**: UPDATE rental expiration dates
- **RETURN**: UPDATE next_rental_expire_at to NULL

---

### Table: `pharma_user_videoplayer_positions`

**Purpose**: Tracks user playback position for resume functionality.

**Primary Key**: `id` (INT) - Auto-increment

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | INT | NO | AUTO | Primary key |
| `pharma_id` | VARCHAR | NO | - | FK to pharmas table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `play_position` | INT | YES | NULL | Position in seconds |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`pharma_id`, `user_id`) - One position per user-pharma pair

**Foreign Keys**:
- `pharma_id` → `pharmas.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **PAUSE**: INSERT/UPDATE with current play_position

---

### Table: `pharma_reviews`

**Purpose**: User ratings and reviews for pharmaceutical videos.

**Primary Key**: `id` (VARCHAR 45) - ULID format: `pharma_review_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(45) | NO | - | Primary key (ULID) |
| `pharma_id` | VARCHAR | NO | - | FK to pharmas table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `rate` | INT | NO | - | Rating score (typically 1-5) |
| `review` | TEXT | YES | NULL | Review text |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`pharma_id`, `user_id`) - One review per user-pharma pair

**Indexes**:
- `IDX_PHARMA_REVIEWS_PHARMA_ID` (on `pharma_id`)
- `IDX_PHARMA_REVIEWS_USER_ID` (on `user_id`)

**Foreign Keys**:
- `pharma_id` → `pharmas.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**: Separate review API (not part of queue/rent flow)

---

### Table: `user_activity_logs`

**Purpose**: Comprehensive log of all user actions across all media types.

**Primary Key**: `id` (INT) - Auto-increment

**Relevant Columns for Pharma**:

| Column Name | Type | Description |
|------------|------|-------------|
| `id` | INT | Primary key |
| `user_id` | VARCHAR | FK to users table |
| `item_id` | VARCHAR | Pharma ID |
| `item_type` | ENUM | 'pharma' |
| `action` | ENUM | 'queue', 'rent', 'renew', 'return', 'play' |
| `meta` | JSONB | Action-specific metadata |
| `created_at` | TIMESTAMP | When action occurred |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Meta Object Structure for Pharma Actions**:

```typescript
interface PharmaActivityMeta {
  // For all credit-based actions
  credit_used?: number;           // Credits consumed (0 for queue, 1 for rent/renew)

  // For RENT and RENEW
  start_time?: Date;              // Rental start timestamp
  end_time?: Date;                // Rental end timestamp

  // For PLAY events
  start_position?: number;        // Starting position in seconds
  end_position?: number;          // Ending position in seconds
  total_time_played?: number;     // Total playback duration in seconds
}
```

**Foreign Keys**:
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with action='queue', meta={credit_used: 0}
- **RENT**: INSERT with action='rent', meta={credit_used, start_time, end_time}
- **RENEW**: INSERT with action='renew', meta={credit_used, start_time, end_time}
- **RETURN**: INSERT with action='return', meta={credit_used: 0}
- **PLAY**: INSERT/UPDATE with action='play', meta={start_position, end_position, total_time_played}
- **PAUSE**: UPDATE existing PLAY record's meta

---

### Table: `companies`

**Purpose**: Company/organization configuration and credit management.

**Columns Affected by Pharma Actions**:

| Column Name | Type | Description |
|------------|------|-------------|
| `id` | VARCHAR | Primary key |
| `available_credits` | INT | Total credits available for users |

**Modified By Actions**:
- **RENT**: DECREMENT by `pharma_rental_credit_cost`
- **RENEW**: DECREMENT by `pharma_rental_credit_cost`

---

## Data Flow by Action

### QUEUE Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-pharmas/:id/actions/queue                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ PharmaUserStatus     │
           │ Service.queue()      │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Pharma exists         │
        │ - Pharma is active      │
        │ - Not already queued    │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ INSERT pharma_user_statuses│
    │ - id: ULID                 │
    │ - pharma_id: pharmaId      │
    │ - user_id: user.id         │
    │ - status: 'queued'         │
    │ - created_at: NOW()        │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ INSERT user_activity_logs  │
    │ - item_type: 'pharma'      │
    │ - action: 'queue'          │
    │ - meta: {credit_used: 0}   │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Return success message     │
    └────────────────────────────┘
```

---

### RENT Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-pharmas/:id/actions/rent                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ PharmaUserStatus     │
           │ Service.rent()       │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Validate:                       │
        │ - Pharma is active              │
        │ - Not already rented            │
        │ - Company has credits           │
        └────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Get Config:                        │
    │ - pharma_rental_period_in_days     │
    │ - pharma_rental_credit_cost        │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT/UPDATE pharma_user_statuses │
    │ - status: 'rented'                 │
    │ - rental_start_at: NOW()           │
    │ - current_rental_expire_at:        │
    │   NOW() + rental_period            │
    │ - next_rental_expire_at: NULL      │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE companies                   │
    │ SET available_credits =            │
    │     available_credits - cost       │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - action: 'rent'                   │
    │ - meta: {credit_used, start, end}  │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Return success message             │
    └────────────────────────────────────┘
```

---

### RENEW Flow (with Advanced Logic)

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-pharmas/:id/actions/renew                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ PharmaUserStatus     │
           │ Service.renew()      │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Validate:                       │
        │ - Status = 'rented'             │
        │ - Company has credits           │
        └────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Check Renewal State:               │
    │                                    │
    │ Scenario 1: current valid, no next│
    │   → Set next = current + period    │
    │                                    │
    │ Scenario 2: current expired, next │
    │   → Advance: current=next,         │
    │     next=next+period               │
    │                                    │
    │ Scenario 3: both expired, no next │
    │   → Fresh: current=NOW()+period    │
    │                                    │
    │ Scenario 4: already extended      │
    │   → ERROR: Cannot renew            │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE pharma_user_statuses        │
    │ (apply appropriate scenario logic) │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE companies                   │
    │ (decrease available_credits)       │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - action: 'renew'                  │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Return success message             │
    └────────────────────────────────────┘
```

---

### PLAY Event Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /pharmas/:id/trigger-event/play                        │
│ Body: { play_position: number }                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ PharmaService        │
           │ .triggerVideoPlayer  │
           │ Event()              │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Rental is valid       │
        │   (current or next not  │
        │    expired)             │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Check for today's PLAY log:        │
    │ (item_id=pharmaId, action='play',  │
    │  DATE(created_at)=TODAY)           │
    └────────┬───────────────────────────┘
             │
             ├─── Exists ────┐
             │               │
             │               ▼
             │    ┌──────────────────────────┐
             │    │ UPDATE user_activity_logs│
             │    │ - start_position: MIN    │
             │    │ - end_position: MAX      │
             │    │ - total_time_played:     │
             │    │   recalculate            │
             │    └──────────┬───────────────┘
             │               │
             └─── Not Exists ┘
                      │
                      ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - action: 'play'                   │
    │ - meta: {start_position,           │
    │          total_time_played: 0}     │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE pharmas                     │
    │ SET total_played =                 │
    │     total_played + 1               │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Return success message             │
    └────────────────────────────────────┘
```

---

## Entity Relationships

```
┌──────────────┐
│   companies  │
│              │
│ - id         │◄──────────┐
│ - available_ │           │
│   credits    │           │ FK: company_id
└──────────────┘           │
                           │
                    ┌──────┴──────┐
                    │    users    │
                    │             │
                    │ - id        │
                    │ - company_id│
                    └──────┬──────┘
                           │
                           │ FK: user_id
        ┌──────────────────┼──────────────────┬─────────────┐
        │                  │                  │             │
        ▼                  ▼                  ▼             ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│pharma_user_   │  │user_activity_│  │pharma_user_  │  │pharma_      │
│  statuses     │  │     logs     │  │  videoplayer_│  │  reviews    │
│               │  │              │  │  positions   │  │             │
│ - pharma_id   │  │ - user_id    │  │ - pharma_id  │  │ - pharma_id │
│ - user_id     │  │ - item_id    │  │ - user_id    │  │ - user_id   │
│ - status      │  │ - action     │  │ - play_pos   │  │ - rate      │
│ - rental_     │  │ - meta       │  └──────┬───────┘  │ - review    │
│   start_at    │  └──────────────┘         │          └──────┬──────┘
│ - current_    │                           │                 │
│   rental_     │                           │                 │
│   expire_at   │                           │                 │
│ - next_rental_│                           │                 │
│   expire_at   │                           │                 │
└───────┬───────┘                           │                 │
        │                                   │                 │
        │ FK: pharma_id                     │ FK: pharma_id   │ FK: pharma_id
        └───────────────────────────────────┼─────────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │   pharmas    │
                                    │              │
                                    │ - id         │
                                    │ - sku        │
                                    │ - title      │
                                    │ - video_url  │
                                    │ - total_     │
                                    │   played     │
                                    │ - categories │
                                    └──────────────┘
```

**Relationship Summary**:
- **One User** → **Many PharmaUserStatuses** (user can have multiple pharmas)
- **One Pharma** → **Many PharmaUserStatuses** (pharma can be used by many users)
- **One User** → **Many UserActivityLogs** (tracks all actions)
- **One User + One Pharma** → **One PharmaUserVideoplayerPosition** (unique position)
- **One User + One Pharma** → **One PharmaReview** (one review per user-pharma)
- **One Company** → **Many Users** (company manages multiple users)

---

## Configuration & Credits

### Company Configuration (AppConfig)

The pharma system behavior is controlled by configuration values stored per company:

| Config Key | Type | Default | Description |
|-----------|------|---------|-------------|
| `pharma_rental_credit_cost` | INT | 1 | Credits deducted for RENT and RENEW actions |
| `pharma_rental_period_in_days` | INT | 14 | Number of days for rental period |

### Credit System

**Credit Costs by Action**:
- **QUEUE**: 0 credits (free)
- **DEQUEUE**: 0 credits (free)
- **RENT**: Configurable (default: 1 credit)
- **RENEW**: Configurable (default: 1 credit)
- **RETURN**: 0 credits (no refund - only cancels advanced rental)
- **PLAY/PAUSE**: 0 credits (free)

**Credit Flow**:
1. Company has total `available_credits` in `companies` table
2. When user performs RENT/RENEW action:
   - System checks if `available_credits >= credit_cost`
   - If yes: Proceeds with action and updates `available_credits = available_credits - credit_cost`
   - If no: Rejects action with insufficient credits error
3. Credits are tracked in `user_activity_logs.meta.credit_used` field

**Important Note**: RETURN action does **not** refund credits. It only cancels the pre-purchased advanced renewal (next_rental_expire_at), allowing the current rental to continue until its expiration.

---

## API Endpoints

### Pharma Catalog Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/pharmas` | List all available pharmas for user's company | JWT |
| GET | `/pharma/home` | Get home page pharma lists | JWT |
| GET | `/pharma-categories` | Get all pharma categories | JWT |
| GET | `/pharma-categories/:id` | Get specific category details | JWT |
| GET | `/pharmas/:id` | Get pharma details by ID | JWT |

### User Pharma Action Endpoints

**Base Route**: `/user-pharmas` (Protected with JwtAuthGuard)

**Pattern**: `POST /user-pharmas/:id/actions/:action`

| Method | Endpoint | Description | Credit Cost | Service Method |
|--------|----------|-------------|-------------|----------------|
| POST | `/user-pharmas/:id/actions/queue` | Add pharma to queue | 0 | `queue()` |
| POST | `/user-pharmas/:id/actions/dequeue` | Remove from queue | 0 | `dequeue()` |
| POST | `/user-pharmas/:id/actions/rent` | Rent pharma | Configurable (default: 1) | `rent()` |
| POST | `/user-pharmas/:id/actions/renew` | Renew rental | Configurable (default: 1) | `renew()` |
| POST | `/user-pharmas/:id/actions/return` | Cancel advanced rental | 0 | `return()` |

### Video Player Event Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/pharmas/:id/trigger-event/play` | Track play event | JWT |
| POST | `/pharmas/:id/trigger-event/pause` | Track pause event and save position | JWT |

**Request Body** (for both):
```json
{
  "play_position": 125  // Position in seconds
}
```

### Pharma Review Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/pharmas/:id/reviews` | Get reviews for pharma | JWT |
| POST | `/pharmas/:id/reviews` | Create/update pharma review | JWT |

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response Format** (Success - typical action):
```json
{
  "message": "Pharma action completed successfully"
}
```

**Error Response Format**:
```json
{
  "statusCode": 400,
  "message": "Insufficient credits",
  "error": "Bad Request"
}
```

---

## Video Player Event Tracking

### Event Types

The pharma system tracks two primary video player events:

#### 1. PLAY Event
- **Triggers**: When user starts or resumes video playback
- **Tracking**:
  - Daily aggregation (one log per day per user per pharma)
  - Records start_position, end_position, total_time_played
  - Increments pharma.total_played counter
- **Use Cases**:
  - Analytics on video engagement
  - Popular content identification
  - Daily watch statistics

#### 2. PAUSE Event
- **Triggers**: When user pauses video playback
- **Tracking**:
  - Saves exact playback position for resume
  - Updates activity log with latest end_position
  - Calculates total time played
- **Use Cases**:
  - Resume playback from last position
  - Watch progress tracking
  - Completion rate calculation

### Position Tracking Details

**Stored in**: `pharma_user_videoplayer_positions` table

**Data Captured**:
- `play_position`: Current second in video (integer)
- `updated_at`: Last position update timestamp

**Update Frequency**: On every PAUSE event

**Resume Capability**: When user returns to video, frontend can query last position and resume from that point

### Activity Log Metadata

**PLAY Action Meta**:
```json
{
  "start_position": 0,          // Where playback started
  "end_position": 125,          // Where playback ended
  "total_time_played": 125      // Total seconds watched
}
```

**Calculation Logic**:
- `start_position`: Minimum position seen during the day
- `end_position`: Maximum position seen during the day
- `total_time_played`: end_position - start_position

**Daily Aggregation**: Each day gets one PLAY log per user per pharma, updated with each play event

---

## Key Differences from Audio/Video

### Similarities with Audio/Video
- Rental-based access model (queue, rent, renew, return)
- User status tracking (queued, rented)
- Video player position tracking
- Review system with rating
- Category assignment
- Featured flag support
- Company-level access control via category restrictions
- Activity logging and credit system
- Soft delete capability

### Key Differences

| Feature | Pharma | Audio | Video |
|---------|--------|-------|-------|
| **Bookshelf/Keep** | ❌ NOT SUPPORTED | ✅ Supported | ❌ NOT SUPPORTED |
| **Statuses** | queued, rented | queued, rented, bookshelved | queued, rented |
| **Rental System** | Dual-tier (current + next) | Single-tier | Dual-tier (current + next) |
| **Default Rental Period** | 14 days | 14 days | 14 days |
| **Credit Cost** | 1 credit | Configurable | 1 credit |
| **Video Tracking** | Full position tracking | ❌ No video | Full player events |
| **Position Resume** | ✅ Yes (table) | ❌ N/A | Events only |
| **Play Counter** | ✅ total_played | ❌ No | ✅ total_played |
| **Daily Purchase Limits** | ❌ No | ✅ Yes | ❌ No |
| **Max Items On Hand** | ❌ No | ✅ Yes | ❌ No |
| **External Integration** | ❌ None | Findaway API | Avilar LMS |
| **Grouping/Playlist** | ❌ No | ❌ No | ✅ Yes (video.group) |

### Pharma-Unique Characteristics

1. **Advanced Renewal System**:
   - Two-tier rental with `current_rental_expire_at` and `next_rental_expire_at`
   - Can pre-purchase renewal before current expires
   - Smart renewal logic handles three different scenarios

2. **Return Mechanics**:
   - Only cancels **advanced/next rental**, not current rental
   - No credit refunds
   - Requires current rental to still be valid

3. **Video Player Position Tracking**:
   - Dedicated table for persistent playback positions
   - Updated on PAUSE events
   - Enables seamless resume capability

4. **Daily Play Aggregation**:
   - One activity log per day per user per pharma
   - Tracks start/end positions and total time
   - Prevents duplicate play logs on same day

5. **No Permanent Ownership**:
   - Cannot "keep" or "bookshelf" pharma content
   - All access is time-limited through rentals
   - Rental-only model

---

## Summary Table: Action Impact Matrix

Quick reference for which tables are affected by each action:

| Action | pharma_user_statuses | user_activity_logs | pharmas | companies | pharma_user_videoplayer_positions |
|--------|---------------------|-------------------|---------|-----------|----------------------------------|
| **QUEUE** | INSERT | INSERT | - | - | - |
| **DEQUEUE** | DELETE | - | - | - | - |
| **RENT** | INSERT/UPDATE | INSERT | - | -credits | - |
| **RENEW** | UPDATE | INSERT | - | -credits | - |
| **RETURN** | UPDATE | INSERT | - | - | - |
| **PLAY** | - | INSERT/UPDATE | +1 total_played | - | - |
| **PAUSE** | - | UPDATE | - | - | INSERT/UPDATE |

**Legend**:
- `INSERT`: New record created
- `UPDATE`: Existing record modified
- `DELETE`: Record removed
- `-credits`: available_credits decremented
- `+1 total_played`: Counter incremented

---

## Code References

### Key Service Files
- Pharma User Actions: [pharma-user-status.service.ts](./services/pharma-user-status.service.ts)
- Pharma Management: [pharma.service.ts](./services/pharma.service.ts)
- Pharma Reviews: [pharma-review.service.ts](./services/pharma-review.service.ts)

### Entity Files
- Pharma Entity: [pharma.entity.ts](./entities/pharma.entity.ts)
- Pharma User Status: [pharma-user-status.entity.ts](./entities/pharma-user-status.entity.ts)
- Pharma Videoplayer Position: [pharma-user-videoplayer-position.entity.ts](./entities/pharma-user-videoplayer-position.entity.ts)
- Pharma Review: [pharma-review.entity.ts](./entities/pharma-review.entity.ts)

### Controller Files
- Pharma Catalog: [pharma.controller.ts](./controllers/pharma.controller.ts)
- User Pharma Actions: [pharma-user-status.controller.ts](./controllers/pharma-user-status.controller.ts)
- Pharma Reviews: [pharma-review.controller.ts](./controllers/pharma-review.controller.ts)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-12
**Maintained By**: Development Team
