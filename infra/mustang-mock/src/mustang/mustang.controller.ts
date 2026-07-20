import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MustangService } from './mustang.service';

type MulterFile = Express.Multer.File;

/** Send a binary buffer as an application/octet-stream download. */
function sendBinary(res: Response, buf: Buffer, filename: string) {
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buf.length),
  });
  res.end(buf);
}

@ApiTags('mustang')
@Controller('mustang')
export class MustangController {
  constructor(private readonly mustang: MustangService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Healthcheck — responds with "pong"' })
  @Header('Content-Type', 'text/plain')
  ping(@Headers('USERNAME') _user?: string): string {
    return this.mustang.ping();
  }

  @Get('notice')
  @ApiOperation({ summary: 'Returns legal related information' })
  @Header('Content-Type', 'text/plain')
  notice(@Headers('USERNAME') _user?: string): string {
    return this.mustang.notice();
  }

  @Post('xmltopdf')
  @ApiOperation({ summary: 'Render an e-invoice XML to a (visual) PDF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  xmlToPdf(@UploadedFiles() files: MulterFile[], @Res() res: Response) {
    sendBinary(res, this.mustang.xmlToPdf(files?.[0]), 'invoice.pdf');
  }

  @Post('xmltohtml')
  @ApiOperation({ summary: 'Render an e-invoice XML to HTML' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'language', enum: ['EN', 'FR', 'DE'], required: true })
  @UseInterceptors(AnyFilesInterceptor())
  xmlToHtml(
    @UploadedFiles() _files: MulterFile[],
    @Query('language') language = 'EN',
    @Res() res: Response,
  ) {
    sendBinary(res, this.mustang.xmlToHtml(language), 'invoice.html');
  }

  @Post('validationReportToPDF')
  @ApiOperation({ summary: 'Turn an XML validation result into a PDF report' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  validationReportToPdf(
    @Body('XMLValidationResult') report: string,
    @Res() res: Response,
  ) {
    sendBinary(res, this.mustang.validationReportToPdf(report), 'report.pdf');
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate an e-invoice, returns an XML report' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'ignoreNotices', type: Boolean, required: false })
  @UseInterceptors(AnyFilesInterceptor())
  validate(
    @UploadedFiles() files: MulterFile[],
    @Query('ignoreNotices') ignoreNotices: string,
    @Res() res: Response,
  ) {
    const xml = this.mustang.validate(files?.[0], ignoreNotices === 'true');
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="validation.xml"');
    res.end(Buffer.from(xml, 'utf-8'));
  }

  @Post('styledinvoicetofx')
  @ApiOperation({ summary: 'Convert a styled invoice (JSON) to Factur-X PDF' })
  @ApiConsumes('application/json')
  @ApiQuery({ name: 'language', enum: ['EN', 'FR', 'DE'], required: true })
  styledInvoiceToFx(
    @Body() body: unknown,
    @Query('language') language = 'EN',
    @Res() res: Response,
  ) {
    sendBinary(res, this.mustang.styledInvoiceToFx(body, language), 'facturx.pdf');
  }

  @Post('phive')
  @ApiOperation({ summary: 'Validate via phive/VESID rule set' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'VESID', required: false })
  @UseInterceptors(AnyFilesInterceptor())
  phive(
    @UploadedFiles() files: MulterFile[],
    @Query('VESID') vesid: string,
    @Res() res: Response,
  ) {
    const xml = this.mustang.phive(files?.[0], vesid);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="phive.xml"');
    res.end(Buffer.from(xml, 'utf-8'));
  }

  @Post('pdf2pdfa')
  @ApiOperation({ summary: 'Convert a PDF to PDF/A-3' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  pdf2pdfa(@UploadedFiles() files: MulterFile[], @Res() res: Response) {
    sendBinary(res, this.mustang.pdf2pdfa(files?.[0]), 'output-pdfa.pdf');
  }

  @Post('parse')
  @ApiOperation({ summary: 'Parse a Factur-X PDF, return embedded XML' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  parse(@UploadedFiles() files: MulterFile[], @Res() res: Response) {
    sendBinary(res, this.mustang.parse(files?.[0]), 'parsed.xml');
  }

  @Post('invoice2XML')
  @ApiOperation({ summary: 'Convert a CalculatedInvoice (JSON) to CII XML' })
  @ApiConsumes('application/json')
  @ApiQuery({ name: 'format', required: true })
  @ApiQuery({ name: 'profile', required: true })
  @ApiQuery({ name: 'version', type: Number, required: true })
  @Header('Content-Type', 'application/xml')
  invoice2Xml(
    @Body() invoice: unknown,
    @Query('format') format: string,
    @Query('profile') profile: string,
    @Query('version') version: string,
  ): string {
    return this.mustang.invoice2Xml(invoice, format, profile, Number(version));
  }

  @Post('extract')
  @ApiOperation({ summary: 'Extract embedded XML from a Factur-X PDF' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor())
  extract(@UploadedFiles() files: MulterFile[], @Res() res: Response) {
    sendBinary(res, this.mustang.extract(files?.[0]), 'extracted.xml');
  }

  @Post('detach')
  @ApiOperation({ summary: 'List/detach attachments from a Factur-X PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'JSON list of attachments' })
  @UseInterceptors(AnyFilesInterceptor())
  detach(@UploadedFiles() files: MulterFile[]): Record<string, unknown> {
    return this.mustang.detach(files?.[0]);
  }

  @Post('combine')
  @ApiOperation({ summary: 'Combine a PDF with invoice JSON -> Factur-X PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'format', required: true })
  @ApiQuery({ name: 'profile', required: true })
  @ApiQuery({ name: 'version', type: Number, required: true })
  @UseInterceptors(AnyFilesInterceptor())
  combine(
    @UploadedFiles() files: MulterFile[],
    @Body('json') json: string,
    @Query('format') format: string,
    @Query('profile') profile: string,
    @Query('version') version: string,
    @Res() res: Response,
  ) {
    const buf = this.mustang.combine(files?.[0], json, format, profile, Number(version));
    sendBinary(res, buf, 'combined.pdf');
  }

  @Post('combineXML')
  @ApiOperation({ summary: 'Combine a PDF with a CII XML -> Factur-X PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'format', required: true })
  @ApiQuery({ name: 'profile', required: true })
  @ApiQuery({ name: 'version', type: Number, required: true })
  @UseInterceptors(AnyFilesInterceptor())
  combineXml(
    @UploadedFiles() files: MulterFile[],
    @Body('XML') xml: string,
    @Query('format') format: string,
    @Query('profile') profile: string,
    @Query('version') version: string,
    @Res() res: Response,
  ) {
    const buf = this.mustang.combineXml(files?.[0], xml, format, profile, Number(version));
    sendBinary(res, buf, 'combined.pdf');
  }

  @Post('ciitoubl')
  @ApiOperation({ summary: 'Convert CII XML to UBL XML' })
  @ApiConsumes('application/xml')
  @Header('Content-Type', 'application/xml')
  ciiToUbl(@Body() ciiXml: string): string {
    return this.mustang.ciiToUbl(ciiXml);
  }

  @Post('cii2ubl')
  @ApiOperation({ summary: 'Convert CII XML to UBL XML (alias)' })
  @ApiConsumes('application/xml')
  @Header('Content-Type', 'application/xml')
  cii2ubl(@Body() ciiXml: string): string {
    return this.mustang.ciiToUbl(ciiXml);
  }

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate invoice totals from an Invoice (JSON)' })
  @ApiConsumes('application/json')
  @ApiOkResponse({ description: 'Invoice with calculated totals' })
  calculate(@Body() invoice: Record<string, unknown>): Record<string, unknown> {
    return this.mustang.calculate(invoice ?? {});
  }
}
