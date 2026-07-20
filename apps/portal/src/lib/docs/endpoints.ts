/**
 * API endpoint catalogue for the /docs page. Mirrors the Mustang mock (and the
 * real Mustangserver) surface — every path is served under the `/api/v1.8.2`
 * context and proxied through the gateway, which authenticates the API key.
 *
 * Keep this in sync with the mock (infra/mustang-mock) if endpoints change. The
 * live "try it" sandbox is not built yet; `sandbox: false` marks that.
 */
export type HttpMethod = 'GET' | 'POST';

export interface Endpoint {
  method: HttpMethod;
  path: string; // relative to API_BASE
  contentType: string | null;
  summary: string;
  returns: string;
}

export interface EndpointGroup {
  key: string;
  title: string;
  description: string;
  endpoints: Endpoint[];
}

/** Path prefix every endpoint shares (the Mustangserver context path). */
export const API_BASE = '/api/v1.8.2';

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    key: 'mustang',
    title: 'Mustang',
    description: 'Factur-X / ZUGFeRD / Order-X generation, conversion and validation.',
    endpoints: [
      { method: 'GET', path: '/mustang/ping', contentType: null, summary: 'Health check', returns: 'text/plain "pong"' },
      { method: 'GET', path: '/mustang/notice', contentType: null, summary: 'Legal notice', returns: 'text/plain' },
      { method: 'POST', path: '/mustang/xmltopdf', contentType: 'multipart/form-data', summary: 'Render invoice XML to a PDF', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/xmltohtml', contentType: 'multipart/form-data', summary: 'Render invoice XML to HTML (query: language=EN|FR|DE)', returns: 'text/html' },
      { method: 'POST', path: '/mustang/validationReportToPDF', contentType: 'multipart/form-data', summary: 'Validation report → PDF', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/validate', contentType: 'multipart/form-data', summary: 'Validate an invoice (query: ignoreNotices=bool)', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/styledinvoicetofx', contentType: 'application/json', summary: 'Styled invoice → Factur-X PDF (query: language)', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/phive', contentType: 'multipart/form-data', summary: 'PHIVE validation (query: VESID)', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/pdf2pdfa', contentType: 'multipart/form-data', summary: 'Convert a PDF to PDF/A', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/parse', contentType: 'multipart/form-data', summary: 'Parse an invoice, return embedded XML', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/invoice2XML', contentType: 'application/json', summary: 'Invoice JSON → CII XML (query: format, profile, version)', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/extract', contentType: 'multipart/form-data', summary: 'Extract XML from a Factur-X PDF', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/detach', contentType: 'multipart/form-data', summary: 'List attachments in a PDF', returns: 'application/json' },
      { method: 'POST', path: '/mustang/combine', contentType: 'multipart/form-data', summary: 'Combine PDF + JSON → Factur-X (query: format, profile, version)', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/combineXML', contentType: 'multipart/form-data', summary: 'Combine PDF + XML → Factur-X (query: format, profile, version)', returns: 'application/pdf' },
      { method: 'POST', path: '/mustang/ciitoubl', contentType: 'application/xml', summary: 'Convert CII → UBL', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/cii2ubl', contentType: 'application/xml', summary: 'Convert CII → UBL (alias)', returns: 'application/xml' },
      { method: 'POST', path: '/mustang/calculate', contentType: 'application/json', summary: 'Compute invoice totals', returns: 'application/json' },
    ],
  },
  {
    key: 's3',
    title: 'S3 file store',
    description: 'Temporary object storage for invoice files (in-memory in the mock).',
    endpoints: [
      { method: 'POST', path: '/s3/upload', contentType: 'multipart/form-data', summary: 'Upload a file', returns: 'application/json { key, filename, size }' },
      { method: 'GET', path: '/s3/list', contentType: null, summary: 'List stored objects', returns: 'application/json []' },
      { method: 'GET', path: '/s3/download/{key}', contentType: null, summary: 'Download a stored file', returns: 'file bytes (404 if missing)' },
      { method: 'GET', path: '/s3/delete/{key}', contentType: null, summary: 'Delete a stored file', returns: 'application/json { key, deleted }' },
    ],
  },
];
