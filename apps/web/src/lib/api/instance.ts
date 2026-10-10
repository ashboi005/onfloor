import { USE_MOCKS } from "../config";
import type { ApiClient } from "./client";
import { httpClient } from "./http";
import { mockClient } from "./mock";

export const api: ApiClient = USE_MOCKS ? mockClient : httpClient;
