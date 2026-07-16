import { Router } from "express"
import { listUsers } from "@/modules/users/queries"
import { asyncHandler } from "../lib/http"

export const usersRouter = Router()

// GET /api/users  → selector de responsables / quién pagó
usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listUsers())
  }),
)
