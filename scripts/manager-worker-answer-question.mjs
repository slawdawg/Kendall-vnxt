#!/usr/bin/env node
import { buildWorkerQuestionAnswerPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerQuestionAnswerPlan(options), options);
