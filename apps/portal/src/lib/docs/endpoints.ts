/**
 * API endpoint catalogue for the /docs page. Mirrors the Mustang mock (and the
 * real Mustangserver) surface — every path is served under the `/api/v1.8.2`
 * context and proxied through the gateway, which authenticates the API key.
 *
 * Keep this in sync with the mock (infra/mustang-mock) if endpoints change. The
 * live "try it" sandbox is not built yet; the docs page says so explicitly.
 */
export type HttpMethod = 'GET' | 'POST';

/** One request header / query param / path param / multipart field. */
export interface Param {
  name: string;
  /** Display type: string, boolean, number, file, enum, object… */
  type: string;
  required: boolean;
  description: string;
  /** Allowed values, when the parameter is an enum. */
  values?: string[];
  /** Value used when the caller omits the parameter. */
  default?: string;
  /** Concrete value shown in the example column. */
  example?: string;
}

export interface ResponseSpec {
  status: number;
  contentType: string;
  description: string;
}

export interface RequestBodySpec {
  contentType: string;
  description: string;
  /** Raw sample payload (JSON or XML) rendered in a code block. */
  example: string;
}

export interface Endpoint {
  /** Stable anchor id, e.g. `mustang-xmltopdf`. */
  id: string;
  method: HttpMethod;
  /** Path relative to API_BASE. `{key}` marks a path parameter. */
  path: string;
  summary: string;
  /** Longer explanation — what it does, gotchas, what the mock returns. */
  description: string;
  /** Request Content-Type, or null for bodyless GETs. */
  contentType: string | null;
  headers: Param[];
  pathParams: Param[];
  queryParams: Param[];
  /** multipart/form-data parts. */
  formFields: Param[];
  /** Raw (JSON/XML) request body, for non-multipart POSTs. */
  body?: RequestBodySpec;
  responses: ResponseSpec[];
  /** Ready-to-paste curl example; `{{BASE}}` is replaced with the full base URL. */
  curl: string;
}

export interface EndpointGroup {
  key: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

/** Path prefix every endpoint shares (the Mustangserver context path). */
export const API_BASE = '/api/v1.8.2';

/** Public API host. Requests go to `${API_HOST}${API_BASE}/...`. */
export const API_HOST = 'https://api.smartlist.uz';

export type Environment = 'live' | 'test';

/**
 * The two APISIX services every endpoint below is reachable through — which
 * one handles a given call is decided purely by the key's own `gw_{env}_`
 * prefix (see infra/apisix/services.json), not by the endpoint itself, so
 * this is documented once here rather than repeated per endpoint.
 */
export interface ServiceInfo {
  environment: Environment;
  /** APISIX service_id (infra/apisix/services.json) that serves this environment. */
  serviceId: string;
  keyPrefix: string;
  label: string;
  description: string;
}

export const SERVICES: ServiceInfo[] = [
  {
    environment: 'live',
    serviceId: 'mustang-mock-prod',
    keyPrefix: 'gw_live_',
    label: 'Live',
    description:
      'Real Mustang e-invoice service. Calls are billed against your monthly quota — use a gw_live_ key.',
  },
  {
    environment: 'test',
    serviceId: 'mustang-mock-test',
    keyPrefix: 'gw_test_',
    label: 'Sandbox',
    description:
      'mustang-mock — fake but correctly-shaped responses, no real document processing happens. Rate limit and monthly quota are capped low regardless of your key\'s configured limits. Use a gw_test_ key; this is the only key type safe to paste into the "Try it" panel below.',
  },
];

/**
 * Headers that apply to every request. The gateway (via APISIX forward-auth)
 * reads Authorization/apikey/X-Request-Id before the call reaches Mustang.
 */
export const GLOBAL_HEADERS: Param[] = [
  {
    name: 'Authorization',
    type: 'string',
    required: true,
    description:
      'Your API key as a bearer token. Required unless you send the `apikey` header instead. Never put the key in a URL or query string.',
    example: 'Bearer gw_live_8f2c1d9a4b7e6f30',
  },
  {
    name: 'apikey',
    type: 'string',
    required: false,
    description:
      'Alternative to Authorization — the raw key with no `Bearer ` prefix. If both are sent, Authorization wins.',
    example: 'gw_live_8f2c1d9a4b7e6f30',
  },
  {
    name: 'Content-Type',
    type: 'string',
    required: false,
    description:
      'Required on every POST; the exact value differs per endpoint (see the endpoint detail). Omit on GET.',
    example: 'multipart/form-data',
  },
  {
    name: 'X-Request-Id',
    type: 'string',
    required: false,
    description:
      'Correlation id. Stored on the usage record for this call, so you can match a request in your logs against your usage report. Generated for you if omitted.',
    example: '3f9b2a10-7c44-4c8e-9a1f-0d6e2b5c8a71',
  },
  {
    name: 'Accept',
    type: 'string',
    required: false,
    description:
      'Optional. Responses are binary/XML/JSON depending on the endpoint; the server ignores content negotiation and always returns its documented type.',
    example: '*/*',
  },
];

/**
 * Headers the gateway adds to the upstream request after a successful auth.
 * You never send these — they are documented so you recognise them in traces.
 */
export const INJECTED_HEADERS: Param[] = [
  {
    name: 'X-User-Id',
    type: 'uuid',
    required: false,
    description: 'Identity of the API key owner, injected by the gateway on allow.',
  },
  {
    name: 'X-Api-Key-Id',
    type: 'uuid',
    required: false,
    description: 'Which of your keys authorized the call — used for per-key usage accounting.',
  },
];

/** Errors any endpoint can return before the request ever reaches Mustang. */
export const GATEWAY_ERRORS: ResponseSpec[] = [
  {
    status: 401,
    contentType: 'application/json',
    description: 'Missing, malformed, unknown, or revoked API key.',
  },
  { status: 403, contentType: 'application/json', description: 'API key expired.' },
  {
    status: 429,
    contentType: 'application/json',
    description:
      'Per-minute rate limit exceeded, or the monthly quota for this key is exhausted (the key flips to `exhausted`).',
  },
];

// ---------------------------------------------------------------------------
// Shared parameter definitions (repeated across several Mustang endpoints).
// ---------------------------------------------------------------------------

const LANGUAGE_QUERY: Param = {
  name: 'language',
  type: 'enum',
  required: true,
  description: 'Language of the rendered document labels.',
  values: ['EN', 'FR', 'DE'],
  default: 'EN',
  example: 'EN',
};

const FORMAT_QUERY: Param = {
  name: 'format',
  type: 'enum',
  required: true,
  description: 'Target e-invoice flavour: ZUGFeRD, Factur-X or Order-X.',
  values: ['ZF', 'FX', 'OX'],
  default: 'ZF',
  example: 'ZF',
};

const PROFILE_QUERY: Param = {
  name: 'profile',
  type: 'enum',
  required: true,
  description: 'Conformance profile — controls which fields the generated XML carries.',
  values: ['MINIMUM', 'BASICWL', 'BASIC', 'EN16931', 'EXTENDED', 'XRECHNUNG'],
  default: 'EN16931',
  example: 'EN16931',
};

const VERSION_QUERY: Param = {
  name: 'version',
  type: 'number',
  required: true,
  description: 'Specification version of the chosen format.',
  values: ['1', '2'],
  default: '2',
  example: '2',
};

const USERNAME_HEADER: Param = {
  name: 'USERNAME',
  type: 'string',
  required: false,
  description:
    'Legacy Mustangserver caller identity. Accepted and ignored — the gateway derives your identity from the API key.',
  example: 'acme-billing',
};

/** The single-file upload part; the server reads the first file part it finds. */
function fileField(description: string, example: string): Param {
  return { name: 'file', type: 'file', required: true, description, example };
}

const INVOICE_JSON_EXAMPLE = `{
  "number": "INV-2026-0042",
  "issueDate": "2026-07-21",
  "currency": "EUR",
  "sender": {
    "name": "Acme GmbH",
    "vatID": "DE123456789",
    "street": "Hauptstr. 1",
    "zip": "10115",
    "location": "Berlin",
    "country": "DE"
  },
  "recipient": {
    "name": "Beispiel AG",
    "street": "Musterweg 7",
    "zip": "80331",
    "location": "München",
    "country": "DE"
  },
  "items": [
    {
      "product": { "name": "Consulting", "unit": "HUR", "taxPercent": 19 },
      "quantity": 10,
      "price": 100.0
    }
  ]
}`;

const CII_XML_EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">
  <rsm:ExchangedDocument>
    <ram:ID>INV-2026-0042</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
  </rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;

const AUTH_HEADER_CURL = `-H "Authorization: Bearer $API_KEY"`;

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    key: 'mustang',
    title: 'Mustang',
    description:
      'Factur-X / ZUGFeRD / Order-X generation, conversion and validation. Binary results are returned as an attachment download (application/octet-stream) with a Content-Disposition filename.',
    endpoints: [
      {
        id: 'mustang-ping',
        method: 'GET',
        path: '/mustang/ping',
        summary: 'Health check',
        description:
          'Cheapest possible authenticated call. Use it to verify a new API key works end-to-end before wiring up real traffic. Counts as one request against your quota.',
        contentType: null,
        headers: [USERNAME_HEADER],
        pathParams: [],
        queryParams: [],
        formFields: [],
        responses: [{ status: 200, contentType: 'text/plain', description: 'The body is exactly `pong`.' }],
        curl: `curl {{BASE}}/mustang/ping \\
  ${AUTH_HEADER_CURL}`,
      },
      {
        id: 'mustang-notice',
        method: 'GET',
        path: '/mustang/notice',
        summary: 'Legal notice',
        description:
          'Returns the upstream licensing / legal notice text for the Mustangproject engine. No parameters.',
        contentType: null,
        headers: [USERNAME_HEADER],
        pathParams: [],
        queryParams: [],
        formFields: [],
        responses: [
          { status: 200, contentType: 'text/plain', description: 'Multi-line licence and warranty notice.' },
        ],
        curl: `curl {{BASE}}/mustang/notice \\
  ${AUTH_HEADER_CURL}`,
      },
      {
        id: 'mustang-xmltopdf',
        method: 'POST',
        path: '/mustang/xmltopdf',
        summary: 'Render invoice XML to a visual PDF',
        description:
          'Takes a CII/UBL invoice XML and renders a human-readable PDF. This is the visual representation only — it is not a hybrid Factur-X file (use /mustang/combineXML for that).',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [fileField('The invoice XML to render.', '@invoice.xml')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'PDF bytes, `Content-Disposition: attachment; filename="invoice.pdf"`.',
          },
        ],
        curl: `curl {{BASE}}/mustang/xmltopdf \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.xml" \\
  -o invoice.pdf`,
      },
      {
        id: 'mustang-xmltohtml',
        method: 'POST',
        path: '/mustang/xmltohtml',
        summary: 'Render invoice XML to HTML',
        description:
          'Same rendering pipeline as xmltopdf but emits standalone HTML — handy for previewing an invoice in a browser or embedding it in a web app.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [LANGUAGE_QUERY],
        formFields: [fileField('The invoice XML to render.', '@invoice.xml')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'HTML document, `filename="invoice.html"`.',
          },
        ],
        curl: `curl "{{BASE}}/mustang/xmltohtml?language=EN" \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.xml" \\
  -o invoice.html`,
      },
      {
        id: 'mustang-validationreporttopdf',
        method: 'POST',
        path: '/mustang/validationReportToPDF',
        summary: 'Validation report → PDF',
        description:
          'Turns the XML report produced by /mustang/validate into a printable PDF. Note the field is a plain text part, not a file upload — paste the report XML as the value.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [
          {
            name: 'XMLValidationResult',
            type: 'string',
            required: true,
            description: 'The full XML validation report, as text.',
            example: '<validation>…</validation>',
          },
        ],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'PDF bytes, `filename="report.pdf"`.',
          },
        ],
        curl: `curl {{BASE}}/mustang/validationReportToPDF \\
  ${AUTH_HEADER_CURL} \\
  -F "XMLValidationResult=<validation.xml" \\
  -o report.pdf`,
      },
      {
        id: 'mustang-validate',
        method: 'POST',
        path: '/mustang/validate',
        summary: 'Validate an invoice',
        description:
          'Runs schema + Schematron validation on an invoice XML or Factur-X PDF and returns an XML report listing errors and notices. Feed the report to /mustang/validationReportToPDF for a readable version.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [
          {
            name: 'ignoreNotices',
            type: 'boolean',
            required: false,
            description: 'When `true`, informational notices are omitted and only errors are reported.',
            values: ['true', 'false'],
            default: 'false',
            example: 'true',
          },
        ],
        formFields: [fileField('Invoice XML or Factur-X PDF to validate.', '@invoice.xml')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'XML validation report, `filename="validation.xml"`. A failed validation is still HTTP 200 — read the report.',
          },
        ],
        curl: `curl "{{BASE}}/mustang/validate?ignoreNotices=true" \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.xml" \\
  -o validation.xml`,
      },
      {
        id: 'mustang-styledinvoicetofx',
        method: 'POST',
        path: '/mustang/styledinvoicetofx',
        summary: 'Styled invoice JSON → Factur-X PDF',
        description:
          'One-shot generation: send a styled invoice document as JSON and get back a hybrid Factur-X PDF (visual PDF/A-3 with the CII XML embedded). No source PDF needed.',
        contentType: 'application/json',
        headers: [],
        pathParams: [],
        queryParams: [LANGUAGE_QUERY],
        formFields: [],
        body: {
          contentType: 'application/json',
          description: 'Styled invoice document — invoice data plus the layout/styling attributes.',
          example: INVOICE_JSON_EXAMPLE,
        },
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'Factur-X PDF, `filename="facturx.pdf"`.',
          },
          { status: 400, contentType: 'application/json', description: 'Malformed JSON body.' },
        ],
        curl: `curl "{{BASE}}/mustang/styledinvoicetofx?language=EN" \\
  ${AUTH_HEADER_CURL} \\
  -H "Content-Type: application/json" \\
  --data @invoice.json \\
  -o facturx.pdf`,
      },
      {
        id: 'mustang-phive',
        method: 'POST',
        path: '/mustang/phive',
        summary: 'PHIVE / VESID rule-set validation',
        description:
          'Validates against a named PHIVE validation execution set (VESID) — use this for Peppol BIS and XRechnung conformance, which go beyond plain EN 16931 validation.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [
          {
            name: 'VESID',
            type: 'string',
            required: false,
            description: 'Validation execution set id, in `group:artifact:version` form.',
            default: 'eu.peppol.bis3:invoice:2023.5',
            example: 'eu.peppol.bis3:invoice:2023.5',
          },
        ],
        formFields: [fileField('Invoice XML to validate.', '@invoice.xml')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'PHIVE result XML, `filename="phive.xml"`, with a `status` attribute and per-rule messages.',
          },
        ],
        curl: `curl "{{BASE}}/mustang/phive?VESID=eu.peppol.bis3:invoice:2023.5" \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.xml" \\
  -o phive.xml`,
      },
      {
        id: 'mustang-pdf2pdfa',
        method: 'POST',
        path: '/mustang/pdf2pdfa',
        summary: 'Convert a PDF to PDF/A-3',
        description:
          'Normalises an arbitrary PDF into PDF/A-3, the archival profile Factur-X requires. Run this first if /mustang/combine rejects your source PDF.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [fileField('Source PDF.', '@invoice.pdf')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'PDF/A-3 bytes, `filename="output-pdfa.pdf"`.',
          },
        ],
        curl: `curl {{BASE}}/mustang/pdf2pdfa \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.pdf" \\
  -o output-pdfa.pdf`,
      },
      {
        id: 'mustang-parse',
        method: 'POST',
        path: '/mustang/parse',
        summary: 'Parse an invoice, return embedded XML',
        description:
          'Reads a Factur-X/ZUGFeRD PDF and returns the structured invoice XML it carries. Functionally the same as /mustang/extract; kept for API compatibility.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [fileField('Factur-X / ZUGFeRD PDF.', '@facturx.pdf')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'CII XML, `filename="parsed.xml"`.',
          },
        ],
        curl: `curl {{BASE}}/mustang/parse \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@facturx.pdf" \\
  -o parsed.xml`,
      },
      {
        id: 'mustang-invoice2xml',
        method: 'POST',
        path: '/mustang/invoice2XML',
        summary: 'Invoice JSON → CII XML',
        description:
          'Converts a calculated invoice object into CII XML for the chosen format/profile/version. Run /mustang/calculate first if your object has no totals.',
        contentType: 'application/json',
        headers: [],
        pathParams: [],
        queryParams: [FORMAT_QUERY, PROFILE_QUERY, VERSION_QUERY],
        formFields: [],
        body: {
          contentType: 'application/json',
          description: 'A CalculatedInvoice object — invoice header, parties and line items.',
          example: INVOICE_JSON_EXAMPLE,
        },
        responses: [
          { status: 200, contentType: 'application/xml', description: 'CII XML, returned inline (not as a download).' },
          { status: 400, contentType: 'application/json', description: 'Malformed JSON or unknown format/profile.' },
        ],
        curl: `curl "{{BASE}}/mustang/invoice2XML?format=ZF&profile=EN16931&version=2" \\
  ${AUTH_HEADER_CURL} \\
  -H "Content-Type: application/json" \\
  --data @invoice.json`,
      },
      {
        id: 'mustang-extract',
        method: 'POST',
        path: '/mustang/extract',
        summary: 'Extract XML from a Factur-X PDF',
        description:
          'Pulls the embedded invoice XML attachment out of a hybrid PDF and returns it verbatim.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [fileField('Factur-X PDF containing an embedded XML.', '@facturx.pdf')],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'CII XML, `filename="extracted.xml"`.',
          },
        ],
        curl: `curl {{BASE}}/mustang/extract \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@facturx.pdf" \\
  -o extracted.xml`,
      },
      {
        id: 'mustang-detach',
        method: 'POST',
        path: '/mustang/detach',
        summary: 'List attachments in a PDF',
        description:
          'Inspects a PDF and lists every embedded file (invoice XML, XMP metadata, extra attachments) with its name, MIME type and size. Returns JSON, not a download.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [fileField('PDF to inspect.', '@facturx.pdf')],
        responses: [
          {
            status: 200,
            contentType: 'application/json',
            description: '`{ source, attachments: [{ filename, mimeType, size }] }`',
          },
        ],
        curl: `curl {{BASE}}/mustang/detach \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@facturx.pdf"`,
      },
      {
        id: 'mustang-combine',
        method: 'POST',
        path: '/mustang/combine',
        summary: 'PDF + invoice JSON → Factur-X',
        description:
          'Embeds invoice data (given as JSON) into an existing PDF, producing a hybrid Factur-X file. The `json` part is a text field, not a second file upload.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [FORMAT_QUERY, PROFILE_QUERY, VERSION_QUERY],
        formFields: [
          fileField('The visual PDF (ideally already PDF/A-3).', '@invoice.pdf'),
          {
            name: 'json',
            type: 'string',
            required: true,
            description: 'Invoice data as a JSON string, sent as a form field.',
            example: '{"number":"INV-2026-0042", …}',
          },
        ],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'Factur-X PDF, `filename="combined.pdf"`.',
          },
        ],
        curl: `curl "{{BASE}}/mustang/combine?format=ZF&profile=EN16931&version=2" \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.pdf" \\
  -F "json=<invoice.json" \\
  -o combined.pdf`,
      },
      {
        id: 'mustang-combinexml',
        method: 'POST',
        path: '/mustang/combineXML',
        summary: 'PDF + CII XML → Factur-X',
        description:
          'Same as /mustang/combine but you supply the invoice as ready-made CII XML in the `XML` text field — use this when you generate the XML yourself.',
        contentType: 'multipart/form-data',
        headers: [],
        pathParams: [],
        queryParams: [FORMAT_QUERY, PROFILE_QUERY, VERSION_QUERY],
        formFields: [
          fileField('The visual PDF (ideally already PDF/A-3).', '@invoice.pdf'),
          {
            name: 'XML',
            type: 'string',
            required: true,
            description: 'CII invoice XML as a string, sent as a form field. Case-sensitive field name.',
            example: '<rsm:CrossIndustryInvoice>…</rsm:CrossIndustryInvoice>',
          },
        ],
        responses: [
          {
            status: 200,
            contentType: 'application/octet-stream',
            description: 'Factur-X PDF, `filename="combined.pdf"`.',
          },
        ],
        curl: `curl "{{BASE}}/mustang/combineXML?format=ZF&profile=EN16931&version=2" \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.pdf" \\
  -F "XML=<invoice.xml" \\
  -o combined.pdf`,
      },
      {
        id: 'mustang-ciitoubl',
        method: 'POST',
        path: '/mustang/ciitoubl',
        summary: 'Convert CII → UBL',
        description:
          'Cross-format conversion for trading partners that only accept UBL (e.g. many Peppol receivers). The request body is the raw XML — no multipart wrapper.',
        contentType: 'application/xml',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [],
        body: {
          contentType: 'application/xml',
          description: 'Raw CII (CrossIndustryInvoice) XML as the request body.',
          example: CII_XML_EXAMPLE,
        },
        responses: [
          { status: 200, contentType: 'application/xml', description: 'UBL Invoice XML, returned inline.' },
        ],
        curl: `curl {{BASE}}/mustang/ciitoubl \\
  ${AUTH_HEADER_CURL} \\
  -H "Content-Type: application/xml" \\
  --data-binary @invoice-cii.xml`,
      },
      {
        id: 'mustang-cii2ubl',
        method: 'POST',
        path: '/mustang/cii2ubl',
        summary: 'Convert CII → UBL (alias)',
        description:
          'Identical behaviour to /mustang/ciitoubl — kept as an alias for older clients. Prefer /mustang/ciitoubl in new code.',
        contentType: 'application/xml',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [],
        body: {
          contentType: 'application/xml',
          description: 'Raw CII (CrossIndustryInvoice) XML as the request body.',
          example: CII_XML_EXAMPLE,
        },
        responses: [
          { status: 200, contentType: 'application/xml', description: 'UBL Invoice XML, returned inline.' },
        ],
        curl: `curl {{BASE}}/mustang/cii2ubl \\
  ${AUTH_HEADER_CURL} \\
  -H "Content-Type: application/xml" \\
  --data-binary @invoice-cii.xml`,
      },
      {
        id: 'mustang-calculate',
        method: 'POST',
        path: '/mustang/calculate',
        summary: 'Compute invoice totals',
        description:
          'Echoes your invoice back with line totals, tax basis, tax total, grand total and due amount filled in. Use it before /mustang/invoice2XML so the generated XML carries consistent monetary totals.',
        contentType: 'application/json',
        headers: [],
        pathParams: [],
        queryParams: [],
        formFields: [],
        body: {
          contentType: 'application/json',
          description: 'An Invoice object with line items but no computed totals.',
          example: INVOICE_JSON_EXAMPLE,
        },
        responses: [
          {
            status: 200,
            contentType: 'application/json',
            description:
              'The same object plus `calculated: true` and `totals: { lineTotalAmount, taxBasisTotalAmount, taxTotalAmount, grandTotalAmount, duePayableAmount, currency }`.',
          },
          { status: 400, contentType: 'application/json', description: 'Malformed JSON body.' },
        ],
        curl: `curl {{BASE}}/mustang/calculate \\
  ${AUTH_HEADER_CURL} \\
  -H "Content-Type: application/json" \\
  --data @invoice.json`,
      },
    ],
  },
  {
    key: 's3',
    title: 'S3 file store',
    description:
      'Temporary object storage for invoice files. Upload once, then reference the returned key. Storage is in-memory in the mock — objects do not survive a restart.',
    endpoints: [
      {
        id: 's3-upload',
        method: 'POST',
        path: '/s3/upload',
        summary: 'Upload a file',
        description:
          'Stores a file and returns its key. The multipart field name must be exactly `file` — any other name is rejected with an error payload.',
        contentType: 'multipart/form-data',
        headers: [USERNAME_HEADER],
        pathParams: [],
        queryParams: [],
        formFields: [
          {
            name: 'file',
            type: 'file',
            required: true,
            description: 'The file to store. Field name is fixed — `file` exactly.',
            example: '@invoice.pdf',
          },
        ],
        responses: [
          {
            status: 200,
            contentType: 'application/json',
            description: '`{ key, filename, size }` — keep `key` to download or delete later.',
          },
          {
            status: 200,
            contentType: 'application/json',
            description: '`{ error: "no file provided (field name must be \\"file\\")" }` when the part is missing or misnamed.',
          },
        ],
        curl: `curl {{BASE}}/s3/upload \\
  ${AUTH_HEADER_CURL} \\
  -F "file=@invoice.pdf"`,
      },
      {
        id: 's3-list',
        method: 'GET',
        path: '/s3/list',
        summary: 'List stored objects',
        description: 'Returns metadata for every stored object. File contents are never included.',
        contentType: null,
        headers: [USERNAME_HEADER],
        pathParams: [],
        queryParams: [],
        formFields: [],
        responses: [
          {
            status: 200,
            contentType: 'application/json',
            description: 'Array of `{ key, filename, mimeType, size, uploadedAt }`.',
          },
        ],
        curl: `curl {{BASE}}/s3/list \\
  ${AUTH_HEADER_CURL}`,
      },
      {
        id: 's3-download',
        method: 'GET',
        path: '/s3/download/{key}',
        summary: 'Download a stored file',
        description:
          'Streams the object back with its original MIME type and filename. URL-encode the key — it contains the original filename.',
        contentType: null,
        headers: [USERNAME_HEADER],
        pathParams: [
          {
            name: 'key',
            type: 'string',
            required: true,
            description: 'Storage key returned by /s3/upload.',
            example: 'mock-000001-invoice.pdf',
          },
        ],
        queryParams: [],
        formFields: [],
        responses: [
          {
            status: 200,
            contentType: 'original MIME type',
            description: 'File bytes with `Content-Disposition: attachment` and the original filename.',
          },
          { status: 404, contentType: 'application/json', description: 'No object with that key.' },
        ],
        curl: `curl {{BASE}}/s3/download/mock-000001-invoice.pdf \\
  ${AUTH_HEADER_CURL} \\
  -O -J`,
      },
      {
        id: 's3-delete',
        method: 'GET',
        path: '/s3/delete/{key}',
        summary: 'Delete a stored file',
        description:
          'Removes an object. Note this is a GET, not a DELETE — it mirrors the upstream Mustangserver API, so make sure link prefetchers cannot reach this URL.',
        contentType: null,
        headers: [USERNAME_HEADER],
        pathParams: [
          {
            name: 'key',
            type: 'string',
            required: true,
            description: 'Storage key returned by /s3/upload.',
            example: 'mock-000001-invoice.pdf',
          },
        ],
        queryParams: [],
        formFields: [],
        responses: [
          { status: 200, contentType: 'application/json', description: '`{ key, deleted: true }`' },
          { status: 404, contentType: 'application/json', description: 'No object with that key.' },
        ],
        curl: `curl {{BASE}}/s3/delete/mock-000001-invoice.pdf \\
  ${AUTH_HEADER_CURL}`,
      },
    ],
  },
];
