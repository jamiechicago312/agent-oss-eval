#!/usr/bin/env node

import { runCliAsync } from "./commands.js";

process.exitCode = await runCliAsync(process.argv.slice(2));
