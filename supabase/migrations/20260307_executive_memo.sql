-- Migration: Add executive_memo column to pursuits table
ALTER TABLE pursuits ADD COLUMN IF NOT EXISTS executive_memo text;
