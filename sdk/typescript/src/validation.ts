import type {
  AgentCard,
  AgentInterface,
  AgentQueryParams,
  ExtendedAgentCard,
} from "./types/index.js";
import type { PaymentMethod } from "./types/identity.js";

const maxAgentIdLen = 128;
const maxAgentNameLen = 120;
const maxAgentDescriptionLen = 2000;
const maxAgentUrlLen = 512;
const maxAgentListItems = 64;
const maxAgentMetadataItems = 64;
const maxAgentMetadataKeyLen = 80;
const maxAgentMetadataValLen = 512;
const maxAgentDocInlineLen = 64 * 1024;
const maxAgentDocMarkdownLen = 32 * 1024;
const agentIdPattern = /^[@A-Za-z0-9][@A-Za-z0-9._:-]{0,127}$/;

export class TinyPlaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TinyPlaceValidationError";
  }
}

export function validateAgentCard(card: AgentCard): void {
  validateIdentifier("agentId", card.agentId, true);
  validateTextField("name", card.name, maxAgentNameLen, false);
  validateTextField(
    "description",
    card.description,
    maxAgentDescriptionLen,
    true,
  );
  validateHandle("username", card.username);
  validateIdentifier("cryptoId", card.cryptoId, true);
  validateEncodedField("publicKey", card.publicKey);
  validateHttpUrl("url", card.url, false);
  validateHttpUrl("endpoint", card.endpoint, false);
  validateInterfaces("supportedInterfaces", card.supportedInterfaces);
  validateStringList("skills", card.skills, maxAgentListItems, 120);
  validateStringList("capabilities", card.capabilities, maxAgentListItems, 80);
  validateStringList("tags", card.tags, maxAgentListItems, 64);
  validatePaymentMethods(card.paymentMethods);
  validateAgentPayment(card.paymentRequirements);
  validateStringList("groups", card.groups, maxAgentListItems, maxAgentIdLen);
  validateAgentDocs(card.docs);
  validateAgentWebhooks(card.webhooks);
  validateStringMap(
    "metadata",
    card.metadata,
    maxAgentMetadataItems,
    maxAgentMetadataKeyLen,
    maxAgentMetadataValLen,
  );
  validateEncodedField("signature", card.signature);
}

export function validateExtendedAgentCard(card: ExtendedAgentCard): void {
  validateIdentifier("agentId", card.agentId, true);
  validateStringList("privateSkills", card.privateSkills, maxAgentListItems, 120);
  validateStringMap(
    "rateLimits",
    card.rateLimits,
    maxAgentMetadataItems,
    maxAgentMetadataKeyLen,
    maxAgentMetadataValLen,
  );
  // The backend serves internalApi.docsUrl as a relative path
  // (/a2a/<id>/internal/docs), consistent with the docs.*Url fields, so allow
  // relative URLs here too (file:// and other non-http schemes are still rejected).
  validateHttpUrl("internalApi.docsUrl", card.internalApi?.docsUrl, true);
  validateInterfaces("internalApi.endpoints", card.internalApi?.endpoints);
  validateStringMap(
    "internalApi.details",
    card.internalApi?.details,
    maxAgentMetadataItems,
    maxAgentMetadataKeyLen,
    maxAgentMetadataValLen,
  );
  validateStringMap(
    "metadata",
    card.metadata,
    maxAgentMetadataItems,
    maxAgentMetadataKeyLen,
    maxAgentMetadataValLen,
  );
}

export function validateAgentQueryParams(params?: AgentQueryParams): void {
  if (!params) return;
  validateQueryInteger("limit", params.limit);
  validateQueryInteger("offset", params.offset);
  validateStringList("tags", params.tags, maxAgentListItems, 64);
}

function validateIdentifier(
  field: string,
  value: string | undefined,
  required: boolean,
): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    if (required) throw invalid(`${field} is required`);
    return;
  }
  if (
    trimmed.length > maxAgentIdLen ||
    !agentIdPattern.test(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    hasControl(trimmed)
  ) {
    throw invalid(`${field} is invalid`);
  }
}

function validateHandle(field: string, value?: string): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return;
  if (!trimmed.startsWith("@")) throw invalid(`${field} must start with @`);
  const label = trimmed.slice(1);
  if (!/^[a-z0-9_]{2,64}$/.test(label)) throw invalid(`${field} is invalid`);
}

function validateTextField(
  field: string,
  value: string | undefined,
  maxLen: number,
  allowEmpty: boolean,
): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    if (!allowEmpty) throw invalid(`${field} is required`);
    return;
  }
  if ([...trimmed].length > maxLen || hasControl(trimmed)) {
    throw invalid(`${field} is invalid`);
  }
}

function validateEncodedField(field: string, value?: string): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return;
  if (trimmed.length > 4096 || hasControl(trimmed)) {
    throw invalid(`${field} is invalid`);
  }
}

function validateHttpUrl(
  field: string,
  value: string | undefined,
  allowRelative: boolean,
): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return;
  if (trimmed.length > maxAgentUrlLen || hasControl(trimmed)) {
    throw invalid(`${field} is invalid`);
  }
  if (allowRelative && trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw invalid(`${field} is invalid`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalid(`${field} must use http or https`);
  }
  if (!parsed.host) throw invalid(`${field} is invalid`);
}

function validateInterfaces(
  field: string,
  interfaces: Array<AgentInterface> | undefined,
): void {
  if (!interfaces) return;
  if (interfaces.length > maxAgentListItems) {
    throw invalid(`${field} has too many items`);
  }
  interfaces.forEach((iface, index) => {
    const prefix = `${field}[${index}]`;
    validateHttpUrl(`${prefix}.url`, iface.url, false);
    validateTextField(`${prefix}.binding`, iface.binding, 80, false);
    validateTextField(`${prefix}.version`, iface.version, 40, false);
  });
}

function validateStringList(
  field: string,
  values: Array<string> | undefined,
  maxItems: number,
  maxLen: number,
): void {
  if (!values) return;
  if (values.length > maxItems) throw invalid(`${field} has too many items`);
  values.forEach((value, index) => {
    validateTextField(`${field}[${index}]`, value, maxLen, false);
  });
}

function validateStringMap(
  field: string,
  values: Record<string, string> | undefined,
  maxItems: number,
  maxKeyLen: number,
  maxValueLen: number,
): void {
  if (!values) return;
  const entries = Object.entries(values);
  if (entries.length > maxItems) throw invalid(`${field} has too many items`);
  entries.forEach(([key, value]) => {
    validateTextField(`${field}.key`, key, maxKeyLen, false);
    validateTextField(`${field}[${key}]`, value, maxValueLen, true);
  });
}

function validatePaymentMethods(methods?: Array<PaymentMethod>): void {
  if (!methods) return;
  if (methods.length > maxAgentListItems) {
    throw invalid("paymentMethods has too many items");
  }
  methods.forEach((method, index) => {
    const prefix = `paymentMethods[${index}]`;
    validateTextField(`${prefix}.network`, method.network, 80, false);
    validateTextField(`${prefix}.address`, method.address, 160, false);
    validateStringList(`${prefix}.assets`, method.assets, 32, 80);
  });
}

function validateAgentPayment(
  payment: AgentCard["paymentRequirements"] | undefined,
): void {
  if (!payment) return;
  validateTextField("paymentRequirements.network", payment.network, 80, false);
  validateTextField("paymentRequirements.asset", payment.asset, 80, false);
  validateTextField("paymentRequirements.rateType", payment.rateType, 40, false);
  validateTextField("paymentRequirements.amount", payment.amount, 80, false);
}

function validateAgentDocs(docs: AgentCard["docs"] | undefined): void {
  if (!docs) return;
  validateInlineDoc("docs.swaggerJson", docs.swaggerJson, maxAgentDocInlineLen);
  validateInlineDoc("docs.swaggerMd", docs.swaggerMd, maxAgentDocMarkdownLen);
  validateInlineDoc("docs.skillMd", docs.skillMd, maxAgentDocMarkdownLen);
  validateHttpUrl("docs.swaggerJsonUrl", docs.swaggerJsonUrl, true);
  validateHttpUrl("docs.swaggerMdUrl", docs.swaggerMdUrl, true);
  validateHttpUrl("docs.skillMdUrl", docs.skillMdUrl, true);
}

function validateInlineDoc(
  field: string,
  value: string | undefined,
  maxLen: number,
): void {
  if (!value) return;
  if (value.length > maxLen || value.includes("\0")) {
    throw invalid(`${field} is invalid`);
  }
}

function validateAgentWebhooks(webhooks: AgentCard["webhooks"]): void {
  if (!webhooks) return;
  if (webhooks.length > maxAgentListItems) {
    throw invalid("webhooks has too many items");
  }
  webhooks.forEach((hook, index) => {
    const prefix = `webhooks[${index}]`;
    validateTextField(`${prefix}.event`, hook.event, 120, false);
    validateHttpUrl(`${prefix}.url`, hook.url, false);
    validateTextField(`${prefix}.secretRef`, hook.secretRef, 120, true);
    validateTextField(`${prefix}.description`, hook.description, 500, true);
    validateStringMap(
      `${prefix}.metadata`,
      hook.metadata,
      maxAgentMetadataItems,
      maxAgentMetadataKeyLen,
      maxAgentMetadataValLen,
    );
  });
}

function validateQueryInteger(field: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw invalid(`${field} must be a non-negative integer`);
  }
}

function hasControl(value: string): boolean {
  return /[\x00-\x1f\x7f]/.test(value);
}

function invalid(message: string): TinyPlaceValidationError {
  return new TinyPlaceValidationError(message);
}
