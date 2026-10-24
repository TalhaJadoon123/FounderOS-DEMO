/**
 * Shared types used across the Founder OS codebase.
 *
 * Kept dependency-free so `lib/shared` can be imported by anything.
 */

export type IsoDate = string; // yyyy-mm-dd
export type IsoDateTime = string; // yyyy-mm-ddTHH:MM:SS.sssZ

export type Direction = 'in' | 'out';
export type Money = number; // minor units (cents)

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
