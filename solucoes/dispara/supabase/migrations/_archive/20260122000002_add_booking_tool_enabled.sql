-- Migration: Add booking_tool_enabled to ai_agents
-- Purpose: Enable/disable the booking flow tool for each AI agent

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS booking_tool_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_agents.booking_tool_enabled IS 'When true, agent can send booking flow to clients for scheduling';
