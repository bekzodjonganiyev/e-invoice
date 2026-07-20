/**
 * Fake payloads returned by the mock. None of this is produced by real
 * Mustangproject processing — it only mirrors the *shape* / content-type
 * of the real service so clients can be developed against it.
 */

/** A tiny but structurally valid PDF file (opens in any viewer). */
export function fakePdf(title = 'Mustang MOCK document'): Buffer {
  const text = `(${title.replace(/[()\\]/g, '')}) Tj`;
  const content = `BT /F1 18 Tf 60 740 Td ${text} ET`;
  const objects = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj',
    `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

export function fakeHtml(language = 'EN'): Buffer {
  return Buffer.from(
    `<!DOCTYPE html>
<html lang="${language.toLowerCase()}">
<head><meta charset="utf-8"><title>Invoice (MOCK)</title></head>
<body>
  <h1>Rechnung / Invoice — MOCK</h1>
  <p>Rendered by the local Mustang mock server (language=${language}).</p>
  <table border="1" cellpadding="6">
    <tr><th>Item</th><th>Qty</th><th>Net</th></tr>
    <tr><td>Sample product</td><td>1</td><td>100.00</td></tr>
  </table>
  <p><strong>Total gross:</strong> 119.00 EUR</p>
</body>
</html>`,
    'utf-8',
  );
}

/** A ZUGFeRD/Factur-X style CII validation result document. */
export function fakeValidationReport(ignoreNotices = false): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<validation filename="mock-invoice.pdf" datetime="2026-01-01T00:00:00">
  <xml>
    <summary status="valid"/>
    <messages>
      ${ignoreNotices ? '' : '<notice location="/">This is a MOCK validation notice.</notice>'}
    </messages>
  </xml>
  <pdf>
    <summary status="valid"/>
  </pdf>
  <summary status="valid"/>
</validation>`;
}

/** Sample UBL 2.1 Invoice (used by the CII->UBL conversion mocks). */
export function fakeUbl(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>MOCK-2026-0001</cbc:ID>
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">119.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

/** Sample CII (Factur-X) invoice XML. */
export function fakeCii(format = 'ZF', profile = 'EN16931', version = 2): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">
  <!-- MOCK format=${format} profile=${profile} version=${version} -->
  <rsm:ExchangedDocument><ram:ID>MOCK-2026-0001</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;
}
