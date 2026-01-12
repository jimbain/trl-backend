# Video System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [User Actions](#user-actions)
3. [Database Schema](#database-schema)
4. [Data Flow by Action](#data-flow-by-action)
5. [Entity Relationships](#entity-relationships)
6. [Configuration & Credits](#configuration--credits)
7. [API Endpoints](#api-endpoints)
8. [Video Player Event Tracking](#video-player-event-tracking)
9. [Avilar LMS Integration](#avilar-lms-integration)
10. [Key Differences from Audio/Pharma](#key-differences-from-audiopharma)

---

## System Overview

The TRL Video System allows users to interact with training videos through six primary actions:
- **Queue**: Add video to a waiting list (no cost)
- **Dequeue**: Remove video from the waiting list
- **Rent**: Temporarily access video for a configurable period (typically 14 days)
- **Renew**: Extend the rental period for already-rented video
- **Return**: Cancel advanced rental (cancel pre-purchased renewal)
- **Video Player Events**: Track play, pause, seek, and other playback events

### Core Components
- **Video Entity**: Represents the training video catalog
- **Video User Status**: Tracks the relationship between users and videos (queued/rented)
- **Video Review**: User ratings and reviews
- **User Activity Log**: Records all user actions with metadata
- **Avilar LMS Integration**: External learning management system for course tracking

### Important Notes
- **No Bookshelf/Keep Action**: Unlike audio, video content cannot be permanently purchased
- **Rental-Only Model**: All video access is time-limited through rentals
- **Advanced Renewal System**: Supports pre-purchasing renewals before current rental expires
- **Video Grouping**: Videos can be grouped into playlists/series
- **Avilar Integration**: Some videos integrate with Avilar LMS for course management

---

## User Actions

### 1. QUEUE Action

**Purpose**: Add a video to the user's waiting list for future access.

**API Endpoint**: `POST /user-videos/:id/actions/queue`

**Service Method**: `VideoUserStatusService.queue(videoId, user)`

**Credit Cost**: 0 (Free action)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `video_user_statuses` | INSERT | `id`, `video_id`, `user_id`, `status`, `created_at`, `updated_at` | ULID, videoId, user.id, 'queued', NOW(), NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `created_at` | user.id, videoId, 'video', 'queue', NOW() |

**Validation Rules**:
- Video must exist and be active (`is_active` = true)
- User cannot already have this video in any status (queued/rented)

**Response**: `{ message: 'Video added to queue successfully' }`

**Example Flow**:
```
User clicks "Add to Queue" → API call → Check if video exists →
Check if user already has this video → Create video_user_statuses record →
Log activity → Return success
```

---

### 2. DEQUEUE Action

**Purpose**: Remove a video from the user's waiting list.

**API Endpoint**: `POST /user-videos/:id/actions/dequeue`

**Service Method**: `VideoUserStatusService.dequeue(videoId, user)`

**Credit Cost**: 0

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `video_user_statuses` | DELETE | WHERE `user_id` = user.id AND `video_id` = videoId AND `status` = 'queued' | - |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action` | user.id, videoId, 'video', 'dequeue' |

**Validation Rules**:
- Video must exist in the user's queue (status = 'queued')
- Must belong to the requesting user

**Response**: `{ message: 'Video removed from queue successfully' }`

**Example Flow**:
```
User clicks "Remove from Queue" → API call → Find queued video →
Delete video_user_statuses record → Log activity → Return success
```

---

### 3. RENT Action

**Purpose**: Rent a video for a limited time period (typically 14 days).

**API Endpoint**: `POST /user-videos/:id/actions/rent`

**Service Method**: `VideoUserStatusService.rent(videoId, user)`

**Credit Cost**: Configurable (default: 1 credit from `video_rental_credit_cost` config)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `video_user_statuses` | INSERT or UPDATE | `id`, `video_id`, `user_id`, `status`, `rental_start_at`, `current_rental_expire_at`, `next_rental_expire_at`, `updated_at` | ULID, videoId, user.id, 'rented', NOW(), NOW() + rental_period, NULL, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, videoId, 'video', 'rent', `{credit_used}`, NOW() |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Special Processing for Avilar Videos**:

If video has `avilar_course_id` set:
1. Generate student ID from user email (using MD5-based intHash)
2. Check if student exists in Avilar system via SOAP API
3. If not exists, create student with company details
4. Check if student is registered for course
5. If not registered, register student for course
6. Only complete rental if Avilar operations succeed

**Validation Rules**:
- Video must be active (`is_active` = true)
- User cannot already have this video with status 'rented'
- Company must have sufficient credits
- For Avilar videos: Must successfully register in Avilar LMS

**Activity Log Meta Structure**:
```json
{
  "credit_used": 1
}
```

**Response**: `{ message: 'Video rented successfully' }`

**Example Flow (Standard Video)**:
```
User clicks "Rent" → API call → Check video is active →
Check user doesn't have active rental → Check company credits →
Create/update video_user_statuses → Deduct credits →
Log activity → Return success
```

**Example Flow (Avilar Video)**:
```
User clicks "Rent" → API call → Validate video and credits →
Call Avilar: Check student exists → Create if needed →
Call Avilar: Check course registration → Register if needed →
Create/update video_user_statuses → Deduct credits →
Log activity → Return success
```

---

### 4. RENEW Action

**Purpose**: Extend the rental period for an already-rented video.

**API Endpoint**: `POST /user-videos/:id/actions/renew`

**Service Method**: `VideoUserStatusService.renew(videoId, user)`

**Credit Cost**: Configurable (default: 1 credit from `video_rental_credit_cost` config)

**Advanced Renewal Logic**:

The video system uses a sophisticated two-tier renewal system with `current_rental_expire_at` and `next_rental_expire_at`:

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
| `video_user_statuses` | UPDATE | `current_rental_expire_at`, `next_rental_expire_at`, `updated_at` | (based on scenario above), NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, videoId, 'video', 'renew', `{credit_used}`, NOW() |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Validation Rules**:
- Video must have `status` = 'rented' for the user
- Company must have sufficient credits
- Cannot renew if already extended (next_rental exists and > current_rental)

**Response**: `{ message: 'Video rental renewed successfully' }`

**Example Flow**:
```
User clicks "Renew" → API call → Find rented video → Check renewal state →
Apply appropriate renewal logic → Update expiration dates →
Deduct credits → Log activity → Return success
```

---

### 5. RETURN Action

**Purpose**: Cancel a pre-purchased advanced renewal (returns the "next" rental).

**API Endpoint**: `POST /user-videos/:id/actions/return`

**Service Method**: `VideoUserStatusService.return(videoId, user)`

**Credit Cost**: 0 (No refund of rental credits)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `video_user_statuses` | UPDATE | `next_rental_expire_at`, `updated_at` | NULL, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, videoId, 'video', 'return', `{credit_used: 0}`, NOW() |

**Validation Rules**:
- Video must have `status` = 'rented' for the user
- Must have `next_rental_expire_at` set (must have advanced rental to return)
- Current rental must still be valid (`current_rental_expire_at` >= NOW())
- Must belong to the requesting user

**Important**: This action only cancels the **advanced/next rental**, not the current active rental. It allows users to cancel a pre-purchased renewal without losing their current access.

**Response**: `{ message: 'Video returned successfully' }`

**Example Flow**:
```
User clicks "Return Advanced Rental" → API call → Find rented video →
Verify next_rental exists → Verify current rental still valid →
Clear next_rental_expire_at → Log activity → Return success
```

---

### 6. VIDEO PLAYER EVENTS

**Purpose**: Track video playback events for analytics and engagement monitoring.

**API Endpoint**: `POST /videos/:id/trigger-video-player-event`

**Service Method**: `VideoService.triggerVideoPlayerEvent(videoId, user, dto)`

**Request Body**:
```typescript
{
  event: string,         // Event type (play, pause, ended, seek, etc.)
  play_position: number  // Current position in seconds (>= 0)
}
```

**Credit Cost**: 0

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, videoId, 'video', 'video_player_event', `{event, play_position}`, NOW() |
| `videos` | UPDATE (conditional) | `total_played` | INCREMENT by 1 (only for 'play' or 'ended' events) |

**Event Types Tracked**:
- `play`: Video playback started
- `pause`: Video playback paused
- `ended`: Video playback completed
- `seek`: User jumped to different position
- `volumechange`: Volume adjusted
- `ratechange`: Playback speed changed
- Custom events as needed

**Special Handling**:
- **play** and **ended** events increment `videos.total_played` counter
- All events are logged with position and timestamp
- No validation of rental status (events tracked even without rental)

**Activity Log Meta Structure**:
```json
{
  "event": "play",
  "play_position": 125
}
```

**Response**: `{ message: 'Video player event recorded successfully' }`

**Example Flow**:
```
Video player fires event → API call → Log activity with event and position →
If event is 'play' or 'ended': increment total_played → Return success
```

---

## Database Schema

### Table: `videos`

**Purpose**: Stores training video catalog data.

**Primary Key**: `id` (VARCHAR 34) - ULID format: `video_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(34) | NO | - | Primary key (ULID) |
| `sku` | VARCHAR | YES | NULL | Stock Keeping Unit, unique identifier |
| `group` | VARCHAR | YES | NULL | Group identifier for playlists/series |
| `title` | VARCHAR | NO | - | Video title |
| `description` | TEXT | YES | NULL | Detailed description |
| `is_active` | BOOLEAN | NO | true | Active/inactive flag |
| `is_featured` | BOOLEAN | NO | false | Featured in catalog |
| `image_url` | VARCHAR | YES | NULL | Thumbnail/cover image URL |
| `runtime` | VARCHAR | YES | NULL | Video duration string (e.g., "1:30:00") |
| `avg_rating` | FLOAT | NO | 0 | Average user rating |
| `categories` | JSONB | YES | [] | Array of category IDs |
| `total_played` | BIGINT | NO | 0 | Cumulative play count |
| `avilar_course_id` | VARCHAR | YES | NULL | Avilar LMS course ID |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `deleted_at` | TIMESTAMP | YES | NULL | Soft delete timestamp |

**Indexes**:
- `IDX_VIDEOS_SKU` (UNIQUE on `sku`)
- `IDX_VIDEOS_GROUP` (on `group`)
- `IDX_VIDEOS_IS_ACTIVE` (on `is_active`)
- `IDX_VIDEOS_AVILAR_COURSE_ID` (on `avilar_course_id`)

**Foreign Keys**: None (standalone table)

**Modified By Actions**:
- **VIDEO PLAYER EVENTS**: `total_played` incremented (for 'play' and 'ended' events)

---

### Table: `video_user_statuses`

**Purpose**: Junction table tracking the relationship between users and videos (queued/rented).

**Primary Key**: `id` (VARCHAR 45) - ULID format: `video_user_status_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(45) | NO | - | Primary key (ULID) |
| `video_id` | VARCHAR | NO | - | FK to videos table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `status` | ENUM | NO | 'queued' | 'queued', 'rented' |
| `rental_start_at` | TIMESTAMP | YES | NULL | When rental began |
| `current_rental_expire_at` | TIMESTAMP | YES | NULL | Current rental expiration |
| `next_rental_expire_at` | TIMESTAMP | YES | NULL | Advanced renewal expiration |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`video_id`, `user_id`) - One status per user-video pair

**Indexes**:
- `IDX_VIDEO_USER_STATUSES_VIDEO_ID` (on `video_id`)
- `IDX_VIDEO_USER_STATUSES_USER_ID` (on `user_id`)

**Foreign Keys**:
- `video_id` → `videos.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with status='queued'
- **DEQUEUE**: DELETE where status='queued'
- **RENT**: INSERT/UPDATE with status='rented', sets rental dates
- **RENEW**: UPDATE rental expiration dates
- **RETURN**: UPDATE next_rental_expire_at to NULL

---

### Table: `video_reviews`

**Purpose**: User ratings and reviews for training videos.

**Primary Key**: `id` (VARCHAR 45) - ULID format: `video_review_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(45) | NO | - | Primary key (ULID) |
| `video_id` | VARCHAR | NO | - | FK to videos table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `rate` | INT | NO | - | Rating score (typically 1-5) |
| `review` | TEXT | YES | NULL | Review text |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`video_id`, `user_id`) - One review per user-video pair

**Indexes**:
- `IDX_VIDEO_REVIEWS_VIDEO_ID` (on `video_id`)
- `IDX_VIDEO_REVIEWS_USER_ID` (on `user_id`)

**Foreign Keys**:
- `video_id` → `videos.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**: Separate review API (not part of queue/rent flow)

---

### Table: `user_activity_logs`

**Purpose**: Comprehensive log of all user actions across all media types.

**Primary Key**: `id` (INT) - Auto-increment

**Relevant Columns for Video**:

| Column Name | Type | Description |
|------------|------|-------------|
| `id` | INT | Primary key |
| `user_id` | VARCHAR | FK to users table |
| `item_id` | VARCHAR | Video ID |
| `item_type` | ENUM | 'video' |
| `action` | ENUM | 'queue', 'rent', 'renew', 'return', 'video_player_event' |
| `meta` | JSONB | Action-specific metadata |
| `created_at` | TIMESTAMP | When action occurred |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Meta Object Structure for Video Actions**:

```typescript
interface VideoActivityMeta {
  // For RENT and RENEW
  credit_used?: number;           // Credits consumed

  // For VIDEO PLAYER EVENTS
  event?: string;                 // Event type (play, pause, ended, seek, etc.)
  play_position?: number;         // Position in seconds
}
```

**Foreign Keys**:
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with action='queue'
- **DEQUEUE**: INSERT with action='dequeue'
- **RENT**: INSERT with action='rent', meta={credit_used}
- **RENEW**: INSERT with action='renew', meta={credit_used}
- **RETURN**: INSERT with action='return', meta={credit_used: 0}
- **VIDEO PLAYER EVENT**: INSERT with action='video_player_event', meta={event, play_position}

---

### Table: `companies`

**Purpose**: Company/organization configuration and credit management.

**Columns Affected by Video Actions**:

| Column Name | Type | Description |
|------------|------|-------------|
| `id` | VARCHAR | Primary key |
| `available_credits` | INT | Total credits available for users |

**Modified By Actions**:
- **RENT**: DECREMENT by `video_rental_credit_cost`
- **RENEW**: DECREMENT by `video_rental_credit_cost`

---

## Data Flow by Action

### QUEUE Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-videos/:id/actions/queue                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ VideoUserStatus      │
           │ Service.queue()      │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Video exists          │
        │ - Video is active       │
        │ - Not already queued    │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ INSERT video_user_statuses │
    │ - id: ULID                 │
    │ - video_id: videoId        │
    │ - user_id: user.id         │
    │ - status: 'queued'         │
    │ - created_at: NOW()        │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ INSERT user_activity_logs  │
    │ - item_type: 'video'       │
    │ - action: 'queue'          │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Return success message     │
    └────────────────────────────┘
```

---

### RENT Flow (with Avilar Integration)

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-videos/:id/actions/rent                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ VideoUserStatus      │
           │ Service.rent()       │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Validate:                       │
        │ - Video is active               │
        │ - Not already rented            │
        │ - Company has credits           │
        └────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Check if video has avilar_course_id│
    └────────┬───────────────────────────┘
             │
             ├─── Yes (Avilar Video) ─────┐
             │                             │
             │                             ▼
             │              ┌──────────────────────────┐
             │              │ AvilarIntegrationService │
             │              │ .ensureStudentExists()   │
             │              └──────────┬───────────────┘
             │                         │
             │                         ▼
             │              ┌──────────────────────────┐
             │              │ Generate student ID from │
             │              │ email (intHash)          │
             │              └──────────┬───────────────┘
             │                         │
             │                         ▼
             │              ┌──────────────────────────┐
             │              │ SOAP: Check if student   │
             │              │ exists in Avilar         │
             │              └──────────┬───────────────┘
             │                         │
             │                         ├─── No ────┐
             │                         │           │
             │                         │           ▼
             │                         │  ┌────────────────┐
             │                         │  │ SOAP: Create   │
             │                         │  │ student with   │
             │                         │  │ company details│
             │                         │  └────────┬───────┘
             │                         │           │
             │                         ▼◄──────────┘
             │              ┌──────────────────────────┐
             │              │ SOAP: Check if registered│
             │              │ for course               │
             │              └──────────┬───────────────┘
             │                         │
             │                         ├─── No ────┐
             │                         │           │
             │                         │           ▼
             │                         │  ┌────────────────┐
             │                         │  │ SOAP: Register │
             │                         │  │ student for    │
             │                         │  │ course         │
             │                         │  └────────┬───────┘
             │                         │           │
             │                         ▼◄──────────┘
             │              ┌──────────────────────────┐
             │              │ Avilar setup complete    │
             │              └──────────┬───────────────┘
             │                         │
             └─── No (Standard) ───────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ INSERT/UPDATE video_user_statuses  │
                    │ - status: 'rented'                 │
                    │ - rental_start_at: NOW()           │
                    │ - current_rental_expire_at:        │
                    │   NOW() + rental_period            │
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
                    │ - action: 'rent'                   │
                    └────────┬───────────────────────────┘
                             │
                             ▼
                    ┌────────────────────────────────────┐
                    │ Return success message             │
                    └────────────────────────────────────┘
```

---

### VIDEO PLAYER EVENT Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /videos/:id/trigger-video-player-event                 │
│ Body: { event: string, play_position: number }              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ VideoService         │
           │ .triggerVideoPlayer  │
           │ Event()              │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Video exists          │
        │ - play_position >= 0    │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - item_type: 'video'               │
    │ - action: 'video_player_event'     │
    │ - meta: {event, play_position}     │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Check if event is 'play' or 'ended'│
    └────────┬───────────────────────────┘
             │
             ├─── Yes ────┐
             │            │
             │            ▼
             │  ┌─────────────────────┐
             │  │ UPDATE videos       │
             │  │ SET total_played =  │
             │  │   total_played + 1  │
             │  └─────────┬───────────┘
             │            │
             └─── No ─────┘
                          │
                          ▼
             ┌────────────────────────────┐
             │ Return success message     │
             └────────────────────────────┘
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
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌──────────────┐  ┌─────────────┐
│video_user_    │  │user_activity_│  │video_reviews│
│  statuses     │  │     logs     │  │             │
│               │  │              │  │ - video_id  │
│ - video_id    │  │ - user_id    │  │ - user_id   │
│ - user_id     │  │ - item_id    │  │ - rate      │
│ - status      │  │ - action     │  │ - review    │
│ - rental_     │  │ - meta       │  └──────┬──────┘
│   start_at    │  └──────────────┘         │
│ - current_    │                           │
│   rental_     │                           │
│   expire_at   │                           │
│ - next_rental_│                           │
│   expire_at   │                           │
└───────┬───────┘                           │
        │                                   │
        │ FK: video_id                      │ FK: video_id
        └───────────────────────────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │   videos     │
                                    │              │
                                    │ - id         │
                                    │ - sku        │
                                    │ - group      │
                                    │ - title      │
                                    │ - video_url  │
                                    │ - total_     │
                                    │   played     │
                                    │ - categories │
                                    │ - avilar_    │
                                    │   course_id  │
                                    └──────────────┘
```

**Relationship Summary**:
- **One User** → **Many VideoUserStatuses** (user can have multiple videos)
- **One Video** → **Many VideoUserStatuses** (video can be used by many users)
- **One User** → **Many UserActivityLogs** (tracks all actions)
- **One User + One Video** → **One VideoReview** (one review per user-video)
- **One Company** → **Many Users** (company manages multiple users)
- **Videos with same `group`** → Playlist/Series relationship

---

## Configuration & Credits

### Company Configuration (AppConfig)

The video system behavior is controlled by configuration values stored per company:

| Config Key | Type | Default | Description |
|-----------|------|---------|-------------|
| `video_rental_credit_cost` | INT | 1 | Credits deducted for RENT and RENEW actions |
| `video_rental_period_in_days` | INT | 14 | Number of days for rental period |

### Credit System

**Credit Costs by Action**:
- **QUEUE**: 0 credits (free)
- **DEQUEUE**: 0 credits (free)
- **RENT**: Configurable (default: 1 credit)
- **RENEW**: Configurable (default: 1 credit)
- **RETURN**: 0 credits (no refund - only cancels advanced rental)
- **VIDEO PLAYER EVENTS**: 0 credits (free)

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

### Video Catalog Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/videos` | List all available videos for user's company with filters | JWT |
| GET | `/videos/:id` | Get video details by ID with playlist | JWT |
| GET | `/video/home` | Get home page video collections | JWT |
| GET | `/video-categories` | Get all video categories | JWT |
| GET | `/video-categories/:id` | Get specific category details | JWT |

### User Video Action Endpoints

**Base Route**: `/user-videos` (Protected with JwtAuthGuard)

**Pattern**: `POST /user-videos/:id/actions/:action`

| Method | Endpoint | Description | Credit Cost | Service Method |
|--------|----------|-------------|-------------|----------------|
| POST | `/user-videos/:id/actions/queue` | Add video to queue | 0 | `queue()` |
| POST | `/user-videos/:id/actions/dequeue` | Remove from queue | 0 | `dequeue()` |
| POST | `/user-videos/:id/actions/rent` | Rent video | Configurable (default: 1) | `rent()` |
| POST | `/user-videos/:id/actions/renew` | Renew rental | Configurable (default: 1) | `renew()` |
| POST | `/user-videos/:id/actions/return` | Cancel advanced rental | 0 | `return()` |

### Video Player Event Endpoint

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/videos/:id/trigger-video-player-event` | Track video player events | JWT |

**Request Body**:
```json
{
  "event": "play",       // Event type
  "play_position": 125   // Position in seconds
}
```

### Video Review Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/videos/:id/reviews` | Get reviews for video (user's review first) | JWT |
| POST | `/videos/:id/reviews` | Create review | JWT |
| PUT | `/videos/:id/reviews` | Update review | JWT |

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response Format** (Success - typical action):
```json
{
  "message": "Video action completed successfully"
}
```

**Response Format** (Get Video with Playlist):
```json
{
  "data": {
    "id": "video_...",
    "title": "Safety Training Module 1",
    "description": "...",
    "image_url": "https://...",
    "runtime": "1:30:00",
    "avg_rating": 4.5,
    "is_featured": true,
    "group": "safety_series",
    "avilar_course_id": "COURSE123",
    "status": "rented",
    "current_rental_expire_at": "2026-01-26T10:00:00Z",
    "next_rental_expire_at": null,
    "is_rental_valid": true,
    "can_renew": true,
    "can_return": false,
    "avilar_lms_url": "http://www.avilar.com/webmentor/template/trl_lms_launch.cfm?empid=TRL1000063263&courseid=COURSE123"
  },
  "playlist": [
    {
      "id": "video_...",
      "title": "Safety Training Module 2",
      "image_url": "https://...",
      ...
    }
  ]
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

### Supported Event Types

The video system tracks various player events for analytics and engagement:

| Event | Description | Increments total_played? |
|-------|-------------|------------------------|
| `play` | Video playback started | ✅ Yes |
| `pause` | Video playback paused | ❌ No |
| `ended` | Video playback completed | ✅ Yes |
| `seek` | User jumped to different position | ❌ No |
| `volumechange` | Volume adjusted | ❌ No |
| `ratechange` | Playback speed changed | ❌ No |
| Custom | Any custom event | ❌ No |

### Event Data Captured

Each event logs:
- `event`: Event type (string)
- `play_position`: Current position in seconds (integer >= 0)
- `created_at`: When event occurred
- `user_id`: Who triggered the event
- `item_id`: Which video

### Use Cases

**Analytics**:
- Track most popular videos via `total_played`
- Identify drop-off points via pause/seek patterns
- Calculate completion rates via ended events
- Monitor engagement patterns

**User Experience**:
- No position resume (unlike pharma - events only)
- Events tracked independently of rental status
- All playback interactions logged

**Reporting**:
- Daily/weekly/monthly play counts
- User engagement metrics
- Content performance analysis

---

## Avilar LMS Integration

### Overview

The Avilar LMS (Learning Management System) integration allows certain videos to be linked with formal training courses in an external system. When users rent Avilar-integrated videos, they are automatically registered in the Avilar system and can access the full course materials.

### Configuration

**Environment Variables**:
```
AVILAR_SOAP_API_BASE_URL=https://www.avilar.com/webmentor/api/soap
AVILAR_ORGANIZATION_ID=your_org_id
AVILAR_ORGANIZATION_PASSWORD=your_org_password
AVILAR_STUDENT_PASSWORD=default_student_password
```

**Video Configuration**:
- Videos with `avilar_course_id` set are Avilar-integrated
- Course ID links video to specific Avilar course

### Student ID Generation

**Algorithm**: MD5-based integer hash of user email

```typescript
function generateStudentId(email: string): string {
  const hash = crypto.createHash('md5').update(email).digest('hex');
  const intValue = parseInt(hash.substring(0, 8), 16);
  return `TRL${intValue}`;
}
```

**Example**: `user@example.com` → `TRL1000063263`

### SOAP API Operations

#### 1. Check if Student Exists
```xml
<IsStudent>
  <studentId>TRL1000063263</studentId>
  <email>user@example.com</email>
</IsStudent>
```

**Response**: Boolean indicating if student exists

---

#### 2. Create Student
```xml
<AddStudent>
  <studentId>TRL1000063263</studentId>
  <firstName>John</firstName>
  <lastName>Doe</lastName>
  <email>user@example.com</email>
  <password>default_password</password>
  <custom>
    <Address>123 Main St</Address>
    <City>Anytown</City>
    <Country>USA</Country>
    <Phone>555-1234</Phone>
    <State>CA</State>
    <Zip>12345</Zip>
  </custom>
</AddStudent>
```

**Custom Fields**: Populated from company data

---

#### 3. Check Course Registration
```xml
<IsRegistered>
  <studentId>TRL1000063263</studentId>
  <courseNo>COURSE123</courseNo>
</IsRegistered>
```

**Response**: Boolean indicating if registered for course

---

#### 4. Register for Course
```xml
<RegisterStudent>
  <studentId>TRL1000063263</studentId>
  <courseNo>COURSE123</courseNo>
</RegisterStudent>
```

**Response**: Success/failure status

---

### Rental Flow with Avilar

```
1. User rents Avilar video
   ↓
2. System generates student ID from email
   ↓
3. Check if student exists (SOAP: IsStudent)
   ├─ No → Create student (SOAP: AddStudent)
   └─ Yes → Continue
   ↓
4. Check if registered for course (SOAP: IsRegistered)
   ├─ No → Register for course (SOAP: RegisterStudent)
   └─ Yes → Continue
   ↓
5. Complete rental (create video_user_statuses)
   ↓
6. Return success to user
```

### LMS URL Generation

When user accesses Avilar video details:

**Format**:
```
http://www.avilar.com/webmentor/template/trl_lms_launch.cfm?empid={studentId}&courseid={courseId}
```

**Example**:
```
http://www.avilar.com/webmentor/template/trl_lms_launch.cfm?empid=TRL1000063263&courseid=COURSE123
```

**Conditions**:
- Only returned if video has `avilar_course_id`
- Only returned if user is registered in Avilar
- Otherwise returns `avilar_lms_url: null`

### Error Handling

**Network Errors**:
- Retry up to 3 times with exponential backoff
- Special handling for DNS failures

**Registration Failures**:
- Block rental with BadRequestException
- User cannot rent video until Avilar registration succeeds

**Validation**:
- Verify company has full address details
- Ensure email is valid for student ID generation

---

## Key Differences from Audio/Pharma

### Similarities with Audio/Pharma
- Rental-based access model (queue, rent, renew, return)
- User status tracking (queued, rented)
- Review system with rating
- Category assignment
- Featured flag support
- Company-level access control via category restrictions
- Activity logging and credit system
- Soft delete capability
- Advanced renewal system (current + next)

### Key Differences

| Feature | Video | Audio | Pharma |
|---------|-------|-------|--------|
| **Bookshelf/Keep** | ❌ NOT SUPPORTED | ✅ Supported | ❌ NOT SUPPORTED |
| **Statuses** | queued, rented | queued, rented, bookshelved | queued, rented |
| **Rental System** | Dual-tier (current + next) | Single-tier | Dual-tier (current + next) |
| **Default Rental Period** | 14 days | 14 days | 14 days |
| **Credit Cost** | 1 credit | Configurable | 1 credit |
| **Video Tracking** | Player events only | ❌ No video | Full position tracking |
| **Position Resume** | ❌ No | ❌ N/A | ✅ Yes (table) |
| **Play Counter** | ✅ total_played | ❌ No | ✅ total_played |
| **Daily Purchase Limits** | ❌ No | ✅ Yes | ❌ No |
| **Max Items On Hand** | ❌ No | ✅ Yes | ❌ No |
| **External Integration** | ✅ Avilar LMS | Findaway API | ❌ None |
| **Grouping/Playlist** | ✅ Yes (video.group) | ❌ No | ❌ No |
| **Player Event Types** | Multiple (play, pause, etc.) | ❌ N/A | play, pause |
| **Position Table** | ❌ No | ❌ N/A | ✅ Yes |

### Video-Unique Characteristics

1. **Avilar LMS Integration**:
   - External learning management system
   - Automatic student registration
   - SOAP API communication
   - Course enrollment tracking
   - LMS launch URLs

2. **Video Grouping/Playlists**:
   - Videos grouped via `group` field
   - Related videos returned as playlist
   - Series/course organization

3. **Comprehensive Event Tracking**:
   - Multiple event types (play, pause, ended, seek, etc.)
   - All events logged with position
   - Play/ended events increment counter
   - No position persistence (events only)

4. **Popular Filter**:
   - Filter by `total_played > 0`
   - Sort by play count DESC
   - Identify trending content

5. **Runtime Field**:
   - Duration stored as string (e.g., "1:30:00")
   - Displayed to users
   - Helps with content selection

6. **No Purchase Option**:
   - Cannot "keep" or "bookshelf" video content
   - All access is time-limited through rentals
   - Rental-only model

7. **Return Mechanics**:
   - Only cancels **advanced/next rental**, not current rental
   - No credit refunds
   - Requires current rental to still be valid

---

## Summary Table: Action Impact Matrix

Quick reference for which tables are affected by each action:

| Action | video_user_statuses | user_activity_logs | videos | companies |
|--------|---------------------|-------------------|--------|-----------|
| **QUEUE** | INSERT | INSERT | - | - |
| **DEQUEUE** | DELETE | INSERT | - | - |
| **RENT** | INSERT/UPDATE | INSERT | - | -credits |
| **RENEW** | UPDATE | INSERT | - | -credits |
| **RETURN** | UPDATE | INSERT | - | - |
| **VIDEO PLAYER EVENT** | - | INSERT | +1 total_played (play/ended only) | - |

**Legend**:
- `INSERT`: New record created
- `UPDATE`: Existing record modified
- `DELETE`: Record removed
- `-credits`: available_credits decremented
- `+1 total_played`: Counter incremented (conditional)

---

## Code References

### Key Service Files
- Video User Actions: [video-user-status.service.ts](./services/video-user-status.service.ts)
- Video Management: [video.service.ts](./services/video.service.ts)
- Video Reviews: [video-review.service.ts](./services/video-review.service.ts)
- Avilar Integration: [avilar-integration.service.ts](./services/avilar-integration.service.ts)

### Entity Files
- Video Entity: [video.entity.ts](./entities/video.entity.ts)
- Video User Status: [video-user-status.entity.ts](./entities/video-user-status.entity.ts)
- Video Review: [video-review.entity.ts](./entities/video-review.entity.ts)

### Controller Files
- Video Catalog: [video.controller.ts](./controllers/video.controller.ts)
- User Video Actions: [video-user-status.controller.ts](./controllers/video-user-status.controller.ts)
- Video Reviews: [video-review.controller.ts](./controllers/video-review.controller.ts)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-12
**Maintained By**: Development Team
