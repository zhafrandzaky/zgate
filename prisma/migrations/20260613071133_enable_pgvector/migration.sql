-- Enable pgvector before the init migration creates the Memory.embedding
-- vector(1536) column. Ordered one second before 20260613071134_init so it
-- runs first in both the real database and Prisma's shadow database (fixes
-- P3006: "vector" type unknown in the shadow DB during `prisma migrate dev`).
CREATE EXTENSION IF NOT EXISTS vector;
