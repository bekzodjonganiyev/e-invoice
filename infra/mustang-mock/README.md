# Mustangserver Mock (NestJS)

A small **NestJS mock server** that reproduces every route of the
[Mustangserver e-invoice API](https://einvoiceservice.officefreund.de/api/v1.8.2/swagger-ui/index.html)
(v1.8.2 — Mustangproject: Factur-X / ZUGFeRD / Order-X, CII↔UBL, validation, S3 file store).

Every endpoint returns a **fake but correctly-shaped** response (right content-type,
right body structure), so you can build and test a frontend/client offline without
calling the real service.

## Run

```bash
npm install
npm run start        # or: npm run start:dev  (watch mode)
```

- API base: `http://localhost:3000/api/v1.8.2`
- Swagger UI: `http://localhost:3000/api/v1.8.2/swagger-ui`
- Health: `GET http://localhost:3000/api/v1.8.2/mustang/ping` → `pong`

Change the port with `PORT=8080 npm run start`.

## Endpoints

All paths are prefixed with `/api/v1.8.2` and all accept an optional `USERNAME` header.

### mustang
| Method | Path | Body | Query | Returns |
|--------|------|------|-------|---------|
| GET  | `/mustang/ping` | — | — | `text/plain` `pong` |
| GET  | `/mustang/notice` | — | — | `text/plain` legal notice |
| POST | `/mustang/xmltopdf` | multipart `file` | — | PDF (octet-stream) |
| POST | `/mustang/xmltohtml` | multipart `file` | `language=EN\|FR\|DE` | HTML (octet-stream) |
| POST | `/mustang/validationReportToPDF` | multipart `XMLValidationResult` | — | PDF |
| POST | `/mustang/validate` | multipart `file` | `ignoreNotices=bool` | validation XML |
| POST | `/mustang/styledinvoicetofx` | JSON | `language=EN\|FR\|DE` | Factur-X PDF |
| POST | `/mustang/phive` | multipart `inputFile` | `VESID` | phive report XML |
| POST | `/mustang/pdf2pdfa` | multipart `file` | — | PDF/A |
| POST | `/mustang/parse` | multipart `file` | — | embedded XML |
| POST | `/mustang/invoice2XML` | JSON `CalculatedInvoice` | `format,profile,version` | CII `application/xml` |
| POST | `/mustang/extract` | multipart `file` | — | extracted XML |
| POST | `/mustang/detach` | multipart `file` | — | `application/json` attachment list |
| POST | `/mustang/combine` | multipart `file` + `json` | `format,profile,version` | Factur-X PDF |
| POST | `/mustang/combineXML` | multipart `file` + `XML` | `format,profile,version` | Factur-X PDF |
| POST | `/mustang/ciitoubl` | `application/xml` | — | UBL `application/xml` |
| POST | `/mustang/cii2ubl` | `application/xml` | — | UBL `application/xml` |
| POST | `/mustang/calculate` | JSON `Invoice` | — | JSON with computed totals |

### s3
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/s3/upload` | multipart `file` | JSON `{ key, filename, size }` |
| GET  | `/s3/list` | — | JSON array of stored objects |
| GET  | `/s3/download/{key}` | — | the stored file bytes (404 if missing) |
| GET  | `/s3/delete/{key}` | — | JSON `{ key, deleted: true }` (404 if missing) |

Files are kept **in memory** and reset on restart.

## Quick examples

```bash
B=http://localhost:3000/api/v1.8.2

curl $B/mustang/ping

curl -X POST $B/mustang/calculate \
  -H 'Content-Type: application/json' \
  -d '{"currency":"EUR","invoiceNumber":"A-1"}'

curl -X POST "$B/mustang/invoice2XML?format=ZF&profile=EN16931&version=2" \
  -H 'Content-Type: application/json' -d '{}'

curl -X POST $B/mustang/xmltopdf -F file=@invoice.xml -o out.pdf

curl -X POST $B/mustang/ciitoubl \
  -H 'Content-Type: application/xml' --data @invoice.xml

# S3 round-trip
KEY=$(curl -s -X POST $B/s3/upload -F file=@invoice.xml | jq -r .key)
curl "$B/s3/download/$KEY" -o downloaded.xml
```

## Structure

```
src/
  main.ts                     bootstrap, global prefix, XML body parser, Swagger
  app.module.ts
  fixtures.ts                 fake PDF / HTML / XML / UBL / CII generators
  mustang/
    mustang.controller.ts     18 routes (multipart, JSON, XML, query, headers)
    mustang.service.ts        mock logic
  s3/
    s3.controller.ts          upload / list / download / delete
    s3.service.ts             in-memory object store
```

## Notes

- This is a **mock**. No real Mustangproject conversion/validation happens — do not
  use it in production. Point your client at the real service base URL
  (`https://einvoiceservice.officefreund.de/api/v1.8.2`) when you need real output.
- The generated PDFs are minimal but valid and open in any viewer.
