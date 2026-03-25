/**
 * Fountain hardware configuration types.
 * These are the user-provided specs describing their physical fountain.
 */

export type TargetPlatform =
  | 'arduino_mega'
  | 'esp32'
  | 'dmx_artnet'
  | 'json_timeline'
  | 'csv'
  | 'modbus';

export type NozzleType =
  | 'center_jet'
  | 'high_jet'
  | 'ring_fountain'
  | 'peacock_tail'
  | 'rising_sun'
  | 'revolving'
  | 'butterfly'
  | 'moving_head'
  | 'organ_fountain'
  | 'corner_jet'
  | 'mist_line'
  | 'water_screen'
  | 'fan_jet';

export interface NozzleConfig {
  id: string;
  type: NozzleType;
  count: number;
  /** Maximum jet height in feet */
  max_height_ft: number;
  /** Spray spread angle in degrees (0 = vertical, 45 = wide fan) */
  spread_angle_deg?: number;
  /** Physical positions (x, y) in feet from fountain center */
  positions?: Array<{ x: number; y: number }>;
  /** DMX channel assignment (assigned during config validation) */
  dmx_channel_start?: number;
  dmx_universe?: number;
}

export interface PumpConfig {
  id: string;
  /** Horsepower rating */
  hp: number;
  /** Which nozzle groups this pump feeds */
  feeds: string[];
  /** Whether this pump is VFD-controlled */
  vfd_controlled: boolean;
  vfd_modbus_address?: number;
  /** DMX channel for speed (0-255 = 0-100% speed, sqrt-corrected for height) */
  dmx_channel_speed?: number;
  dmx_channel_enable?: number;
  dmx_universe?: number;
}

export interface ValveConfig {
  count: number;
  /** Minimum valve open/close cycle time in milliseconds */
  min_cycle_ms: number;
  /** For large pipes (> 2 inch) — prevents water hammer */
  min_close_time_large_pipe_ms: number;
  /** Maximum switching frequency in Hz */
  max_frequency_hz: number;
}

export interface LEDConfig {
  count: number;
  type: 'rgb' | 'rgbw' | 'single_color';
  /** DMX channels per LED (3 for RGB, 4 for RGBW) */
  channels_per_fixture: number;
  dmx_channel_start: number;
  dmx_universe: number;
  /** LED groups for zone-based color control */
  groups?: Array<{
    id: string;
    name: string;
    led_indices: number[];
  }>;
}

export interface LaserConfig {
  count: number;
  /** DMX channels per laser head (typically 16) */
  channels_per_laser: number;
  dmx_universe: number;
  dmx_channel_start: number;
}

export interface FountainConfig {
  id: string;
  name: string;
  /** Physical dimensions of the fountain pool */
  dimensions: {
    length_ft: number;
    width_ft: number;
    depth_ft?: number;
  };
  nozzles: NozzleConfig[];
  pumps: PumpConfig[];
  valves: ValveConfig;
  leds: LEDConfig;
  lasers?: LaserConfig;
  target_platform: TargetPlatform;
  /** Optional preset name (e.g., 'maker_associates_100x30') */
  preset?: string;
  created_at?: string;
  updated_at?: string;
}

/** Preset fountain configurations for common fountain types */
export type FountainPreset =
  | 'maker_associates_100x30'
  | 'municipal_50x20'
  | 'small_garden_15x10'
  | 'hobbyist_5_nozzle';

export const FOUNTAIN_PRESETS: Record<FountainPreset, Omit<FountainConfig, 'id' | 'created_at' | 'updated_at'>> = {
  maker_associates_100x30: {
    name: 'Maker Associates 100x30ft (Reference)',
    dimensions: { length_ft: 100, width_ft: 30, depth_ft: 4 },
    nozzles: [
      { id: 'center_jet', type: 'center_jet', count: 1, max_height_ft: 60, positions: [{ x: 0, y: 0 }] },
      { id: 'high_jets', type: 'high_jet', count: 8, max_height_ft: 40 },
      { id: 'ring_fountains', type: 'ring_fountain', count: 4, max_height_ft: 20 },
      { id: 'peacock_tail', type: 'peacock_tail', count: 2, max_height_ft: 15, spread_angle_deg: 30 },
      { id: 'rising_sun', type: 'rising_sun', count: 2, max_height_ft: 12 },
      { id: 'revolving', type: 'revolving', count: 2, max_height_ft: 10 },
      { id: 'organ_fountains', type: 'organ_fountain', count: 4, max_height_ft: 8 },
      { id: 'corner_jets', type: 'corner_jet', count: 4, max_height_ft: 6 },
      { id: 'mist_lines', type: 'mist_line', count: 2, max_height_ft: 3 },
      { id: 'water_screen', type: 'water_screen', count: 1, max_height_ft: 20 },
    ],
    pumps: [
      { id: 'pump_main', hp: 30, feeds: ['center_jet'], vfd_controlled: true, vfd_modbus_address: 1 },
      { id: 'pump_high', hp: 20, feeds: ['high_jets'], vfd_controlled: true, vfd_modbus_address: 2 },
      { id: 'pump_ring', hp: 10, feeds: ['ring_fountains', 'peacock_tail'], vfd_controlled: true, vfd_modbus_address: 3 },
      { id: 'pump_effects', hp: 5, feeds: ['rising_sun', 'revolving', 'organ_fountains'], vfd_controlled: true, vfd_modbus_address: 4 },
      { id: 'pump_mist', hp: 3, feeds: ['mist_lines', 'corner_jets'], vfd_controlled: false },
      { id: 'pump_screen', hp: 8, feeds: ['water_screen'], vfd_controlled: false },
    ],
    valves: {
      count: 38,
      min_cycle_ms: 200,
      min_close_time_large_pipe_ms: 300,
      max_frequency_hz: 5,
    },
    leds: {
      count: 150,
      type: 'rgb',
      channels_per_fixture: 3,
      dmx_channel_start: 1,
      dmx_universe: 1,
    },
    target_platform: 'dmx_artnet',
  },
  municipal_50x20: {
    name: 'Municipal 50x20ft Fountain',
    dimensions: { length_ft: 50, width_ft: 20, depth_ft: 3 },
    nozzles: [
      { id: 'center_jet', type: 'center_jet', count: 1, max_height_ft: 30 },
      { id: 'high_jets', type: 'high_jet', count: 4, max_height_ft: 20 },
      { id: 'ring_fountains', type: 'ring_fountain', count: 2, max_height_ft: 10 },
      { id: 'corner_jets', type: 'corner_jet', count: 4, max_height_ft: 5 },
    ],
    pumps: [
      { id: 'pump_main', hp: 10, feeds: ['center_jet'], vfd_controlled: true, vfd_modbus_address: 1 },
      { id: 'pump_ring', hp: 5, feeds: ['high_jets', 'ring_fountains'], vfd_controlled: true, vfd_modbus_address: 2 },
      { id: 'pump_corner', hp: 2, feeds: ['corner_jets'], vfd_controlled: false },
    ],
    valves: { count: 12, min_cycle_ms: 200, min_close_time_large_pipe_ms: 300, max_frequency_hz: 5 },
    leds: { count: 48, type: 'rgb', channels_per_fixture: 3, dmx_channel_start: 1, dmx_universe: 1 },
    target_platform: 'dmx_artnet',
  },
  small_garden_15x10: {
    name: 'Small Garden Fountain 15x10ft',
    dimensions: { length_ft: 15, width_ft: 10, depth_ft: 2 },
    nozzles: [
      { id: 'center_jet', type: 'center_jet', count: 1, max_height_ft: 8 },
      { id: 'ring_fountain', type: 'ring_fountain', count: 1, max_height_ft: 4 },
      { id: 'corner_jets', type: 'corner_jet', count: 4, max_height_ft: 3 },
    ],
    pumps: [
      { id: 'pump_main', hp: 1, feeds: ['center_jet', 'ring_fountain', 'corner_jets'], vfd_controlled: false },
    ],
    valves: { count: 6, min_cycle_ms: 200, min_close_time_large_pipe_ms: 200, max_frequency_hz: 5 },
    leds: { count: 12, type: 'rgb', channels_per_fixture: 3, dmx_channel_start: 1, dmx_universe: 1 },
    target_platform: 'arduino_mega',
  },
  hobbyist_5_nozzle: {
    name: 'Hobbyist 5-Nozzle Fountain',
    dimensions: { length_ft: 6, width_ft: 4, depth_ft: 1 },
    nozzles: [
      { id: 'center_jet', type: 'center_jet', count: 1, max_height_ft: 3 },
      { id: 'corner_jets', type: 'corner_jet', count: 4, max_height_ft: 2 },
    ],
    pumps: [
      { id: 'pump_main', hp: 0.5, feeds: ['center_jet', 'corner_jets'], vfd_controlled: false },
    ],
    valves: { count: 5, min_cycle_ms: 200, min_close_time_large_pipe_ms: 200, max_frequency_hz: 5 },
    leds: { count: 5, type: 'rgb', channels_per_fixture: 3, dmx_channel_start: 1, dmx_universe: 1 },
    target_platform: 'arduino_mega',
  },
};
