import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

const handler = (request: Request) => {
  const auth = getAuth();
  if (!auth.handler) {
    return Promise.resolve(new Response("Authentication handler unavailable.", { status: 500 }));
  }
  return auth.handler(request);
};

export const { GET, POST } = toNextJsHandler(handler);
