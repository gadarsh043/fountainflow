# FountainFlow API Reference

Base URL: `http://localhost:3001` (development) / `https://api.fountainflow.io` (production)

All endpoints require a valid Clerk JWT in the `Authorization: Bearer <token>` header, except `/health`.

---

## Projects

### `POST /projects`
Create a new fountain choreography project.

**Request:**
```json
{
  "name": "Wedding Fountain Show",
  "fountain_config": {
    "name": "Municipal 50x20ft Fountain",
    "dimensions": { "length_ft": 50, "width_ft": 20 },
    "nozzles": [...],
    "pumps": [...],
    "valves": { "count": 12, "min_cycle_ms": 200, ... },
    "leds": { "count": 48, "type": "rgb", ... },
    "target_platform": "dmx_artnet"
  }
}
```

**Response `201`:**
```json
{
  "id": "clx1234abc",
  "name": "Wedding Fountain Show",
  "status": "draft",
  "fountain_config": {...},
  "created_at": "2026-03-25T12:00:00Z"
}
```

---

### `GET /projects`
List all projects for the authenticated user.

**Response `200`:**
```json
{
  "projects": [
    {
      "id": "clx1234abc",
      "name": "Wedding Fountain Show",
      "status": "completed",
      "created_at": "2026-03-25T12:00:00Z",
      "updated_at": "2026-03-25T12:05:00Z"
    }
  ],
  "total": 1
}
```

---

### `GET /projects/:id`
Get a specific project with all job history.

**Response `200`:**
```json
{
  "id": "clx1234abc",
  "name": "Wedding Fountain Show",
  "status": "completed",
  "fountain_config": {...},
  "jobs": [...],
  "created_at": "...",
  "updated_at": "..."
}
```

---

### `PUT /projects/:id`
Update project name or fountain config.

### `DELETE /projects/:id`
Delete a project and all associated files.

---

## Jobs

### `POST /jobs`
Submit a project for audio analysis + choreography generation.

**Request:**
```json
{
  "project_id": "clx1234abc",
  "audio_file_key": "uploads/clx1234abc/audio.mp3",
  "target_platforms": ["arduino_mega", "dmx_artnet", "json_timeline"],
  "use_ai_refinement": false
}
```

**Response `202`:**
```json
{
  "job_id": "job_xyz789",
  "status": "pending",
  "created_at": "2026-03-25T12:00:00Z"
}
```

---

### `GET /jobs/:id`
Get job status and results.

**Response `200`:**
```json
{
  "job_id": "job_xyz789",
  "status": "completed",
  "stage": "completed",
  "progress_pct": 100,
  "analysis_result_key": "results/job_xyz789/analysis.json",
  "timeline_key": "results/job_xyz789/timeline.json",
  "code_package_key": "results/job_xyz789/code.zip",
  "simulation_data_key": "results/job_xyz789/sim_data.json",
  "processing_time_ms": 45230,
  "completed_at": "2026-03-25T12:01:30Z"
}
```

---

## Storage

### `POST /storage/presigned-upload`
Get a presigned S3 URL for direct browser upload.

**Request:**
```json
{
  "project_id": "clx1234abc",
  "filename": "my_song.mp3",
  "content_type": "audio/mpeg",
  "file_size_bytes": 8388608
}
```

**Response `200`:**
```json
{
  "upload_url": "https://s3.amazonaws.com/fountainflow-prod/uploads/...",
  "s3_key": "uploads/clx1234abc/my_song.mp3",
  "expires_in_seconds": 300
}
```

---

### `GET /storage/download/:key`
Get a presigned download URL for a result file.

**Response `200`:**
```json
{
  "download_url": "https://s3.amazonaws.com/...",
  "expires_in_seconds": 3600
}
```

---

## WebSocket Events

Connect to `ws://localhost:3001` (socket.io).

Authentication: pass token in handshake auth: `{ auth: { token: "Bearer ..." } }`

### Emitted by server:

**`job:progress`**
```json
{
  "job_id": "job_xyz789",
  "stage": "analyzing_beats",
  "progress_pct": 35,
  "message": "Detecting beats with RNN beat tracker..."
}
```

**`job:completed`**
```json
{
  "job_id": "job_xyz789",
  "result": {
    "code_package_key": "results/job_xyz789/code.zip",
    "simulation_data_key": "results/job_xyz789/sim_data.json"
  }
}
```

**`job:failed`**
```json
{
  "job_id": "job_xyz789",
  "error": "Audio conversion failed: unsupported format"
}
```

---

## Health

### `GET /health`
No auth required.

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-25T12:00:00Z",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```
