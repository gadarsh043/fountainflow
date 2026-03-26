import { z } from 'zod';

const NozzleConfigSchema = z.object({
  id: z.string(),
  type: z.enum([
    'center_jet', 'high_jet', 'ring_fountain', 'peacock_tail', 'rising_sun',
    'revolving', 'butterfly', 'moving_head', 'organ_fountain', 'corner_jet',
    'mist_line', 'water_screen', 'fan_jet',
  ]),
  count: z.number().int().positive(),
  max_height_ft: z.number().positive(),
  spread_angle_deg: z.number().optional(),
  positions: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  dmx_channel_start: z.number().optional(),
  dmx_universe: z.number().optional(),
});

const PumpConfigSchema = z.object({
  id: z.string(),
  hp: z.number().positive(),
  feeds: z.array(z.string()),
  vfd_controlled: z.boolean(),
  vfd_modbus_address: z.number().optional(),
  dmx_channel_speed: z.number().optional(),
  dmx_channel_enable: z.number().optional(),
  dmx_universe: z.number().optional(),
});

const ValveConfigSchema = z.object({
  count: z.number().int().nonnegative(),
  min_cycle_ms: z.number().positive(),
  min_close_time_large_pipe_ms: z.number().positive(),
  max_frequency_hz: z.number().positive(),
});

const LEDConfigSchema = z.object({
  count: z.number().int().nonnegative(),
  type: z.enum(['rgb', 'rgbw', 'single_color']),
  channels_per_fixture: z.number().int().positive(),
  dmx_channel_start: z.number().int().nonnegative(),
  dmx_universe: z.number().int().nonnegative(),
  groups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    led_indices: z.array(z.number()),
  })).optional(),
});

// Full fountain configuration — mirrors @fountainflow/shared FountainConfig
export const FountainConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  dimensions: z.object({
    length_ft: z.number().positive(),
    width_ft: z.number().positive(),
    depth_ft: z.number().optional(),
  }),
  nozzles: z.array(NozzleConfigSchema).min(1).max(500),
  pumps: z.array(PumpConfigSchema),
  valves: ValveConfigSchema,
  leds: LEDConfigSchema,
  lasers: z.object({
    count: z.number().int().nonnegative(),
    channels_per_laser: z.number().int().positive(),
    dmx_universe: z.number().int().nonnegative(),
    dmx_channel_start: z.number().int().nonnegative(),
  }).optional(),
  target_platform: z.enum(['arduino_mega', 'esp32', 'dmx_artnet', 'json_timeline', 'csv', 'modbus']),
  preset: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type FountainConfig = z.infer<typeof FountainConfigSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').trim(),
  fountain_config: FountainConfigSchema,
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

// Response type
export interface ProjectResponse {
  id: string;
  name: string;
  user_id: string;
  org_id: string | null;
  status: string;
  fountain_config: FountainConfig;
  created_at: Date;
  updated_at: Date;
}
