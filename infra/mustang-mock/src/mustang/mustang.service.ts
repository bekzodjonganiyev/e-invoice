import { Injectable } from '@nestjs/common';
import {
  fakeCii,
  fakeHtml,
  fakePdf,
  fakeUbl,
  fakeValidationReport,
} from '../fixtures';

/**
 * All logic here is MOCK. It never runs real Mustangproject processing;
 * it returns fixed, well-shaped payloads so a client can be built/tested
 * offline. Inputs are lightly inspected only to make responses look alive.
 */
@Injectable()
export class MustangService {
  ping(): string {
    return 'pong';
  }

  notice(): string {
    return [
      'Mustangserver MOCK.',
      'This is a local stand-in for the Mustangproject e-invoice service.',
      'Mustangproject is licensed under the Apache License 2.0.',
      'No warranty. Responses are simulated and must not be used in production.',
    ].join('\n');
  }

  xmlToPdf(file?: Express.Multer.File): Buffer {
    return fakePdf(`Factur-X from ${file?.originalname ?? 'input.xml'}`);
  }

  xmlToHtml(language = 'EN'): Buffer {
    return fakeHtml(language);
  }

  validationReportToPdf(_report: string): Buffer {
    return fakePdf('Validation report');
  }

  validate(file: Express.Multer.File, ignoreNotices = false): string {
    return fakeValidationReport(ignoreNotices);
  }

  styledInvoiceToFx(_invoiceJson: unknown, _language = 'EN'): Buffer {
    return fakePdf('Styled invoice -> Factur-X');
  }

  phive(file: Express.Multer.File, vesid?: string): string {
    // The real endpoint runs a phive/VESID validation; mock returns a report.
    return `<?xml version="1.0" encoding="UTF-8"?>
<phive-result vesid="${vesid ?? 'eu.peppol.bis3:invoice:2023.5'}" status="valid">
  <file>${file?.originalname ?? 'input.xml'}</file>
  <message level="INFO">MOCK phive validation passed.</message>
</phive-result>`;
  }

  pdf2pdfa(file?: Express.Multer.File): Buffer {
    return fakePdf(`PDF/A-3 from ${file?.originalname ?? 'input.pdf'}`);
  }

  parse(file?: Express.Multer.File): Buffer {
    // Real endpoint extracts embedded XML from a Factur-X PDF.
    return Buffer.from(fakeCii(), 'utf-8');
  }

  invoice2Xml(
    invoice: unknown,
    format = 'ZF',
    profile = 'EN16931',
    version = 2,
  ): string {
    return fakeCii(format, profile, version);
  }

  extract(file?: Express.Multer.File): Buffer {
    return Buffer.from(fakeCii(), 'utf-8');
  }

  detach(file?: Express.Multer.File): Record<string, unknown> {
    return {
      source: file?.originalname ?? 'input.pdf',
      attachments: [
        { filename: 'factur-x.xml', mimeType: 'text/xml', size: 2048 },
        { filename: 'metadata.xmp', mimeType: 'application/xml', size: 512 },
      ],
    };
  }

  combine(
    file: Express.Multer.File,
    _json: string,
    format = 'ZF',
    profile = 'EN16931',
    version = 2,
  ): Buffer {
    return fakePdf(
      `Combined ${file?.originalname ?? 'input.pdf'} [${format}/${profile}/v${version}]`,
    );
  }

  combineXml(
    file: Express.Multer.File,
    _xml: string,
    format = 'ZF',
    profile = 'EN16931',
    version = 2,
  ): Buffer {
    return fakePdf(
      `CombinedXML ${file?.originalname ?? 'input.pdf'} [${format}/${profile}/v${version}]`,
    );
  }

  ciiToUbl(_ciiXml: string): string {
    return fakeUbl();
  }

  calculate(invoice: Record<string, unknown>): Record<string, unknown> {
    // Echo the invoice back with fabricated calculated totals.
    const net = 100.0;
    const taxRate = 0.19;
    const tax = +(net * taxRate).toFixed(2);
    return {
      ...invoice,
      calculated: true,
      totals: {
        lineTotalAmount: net,
        taxBasisTotalAmount: net,
        taxTotalAmount: tax,
        grandTotalAmount: +(net + tax).toFixed(2),
        duePayableAmount: +(net + tax).toFixed(2),
        currency: (invoice?.['currency'] as string) ?? 'EUR',
      },
    };
  }
}
