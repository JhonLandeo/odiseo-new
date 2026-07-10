import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { ExtractedQuestion } from './core-api.service';

export interface DesignTemplateConfig {
  bannerImageUrl?: string | null;
  watermarkImageUrl?: string | null;
  coverImageUrl?: string | null;
  showCover?: boolean;
  primaryTitleColor?: string;
  secondaryTitleColor?: string;
  backgroundHighlightColor?: string;
  marginTop?: string;
  marginBottom?: string;
  marginInside?: string;
  marginOutside?: string;
  isBookMode?: boolean;
  fontFamily?: string;
  contentFontSize?: string;
  contentTextColor?: string;
  borderRadius?: string;
  blocksConfig?: any;
  headerConfig?: any;
  footerConfig?: any;
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  private async convertUrlToBase64(
    url: string | null | undefined,
  ): Promise<string> {
    if (!url) return '';
    try {
      this.logger.log(`Fetching image for base64 conversion: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'image/png';
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error: any) {
      this.logger.error(
        `Error converting image URL to base64: ${error.message} (URL: ${url})`,
      );
      return url; // Fallback to original URL
    }
  }

  async generatePdf(
    tenant: any,
    courseId: string,
    questions: ExtractedQuestion[],
    design?: DesignTemplateConfig | null,
    weekNumber?: number,
    templateName?: string,
    withSolution = false,
    withKeysTable = false,
  ): Promise<Buffer> {
    this.logger.log(
      `Generating PDF for course ${courseId} with ${questions.length} questions. Solution: ${withSolution}, KeysTable: ${withKeysTable}`,
    );

    // 1. Resolve design image URLs to base64 data URIs
    const resolvedDesign: DesignTemplateConfig = {
      ...design,
      bannerImageUrl: design?.bannerImageUrl
        ? await this.convertUrlToBase64(design.bannerImageUrl)
        : null,
      watermarkImageUrl: design?.watermarkImageUrl
        ? await this.convertUrlToBase64(design.watermarkImageUrl)
        : null,
    };

    // 2. Build the full HTML content
    const html = this.buildHtml(
      tenant,
      courseId,
      questions,
      resolvedDesign,
      weekNumber,
      templateName,
      withSolution,
      withKeysTable,
    );

    // 3. Define footer template for Playwright
    const wNum = weekNumber || 1;
    const tplName = templateName || 'Material';
    const courseName = tenant.commercial_name || courseId;
    const cycleName = tenant.cycle_name || '';
    const instName = tenant.tenant_name || cycleName;

    const resolveVars = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/\{page\}/g, '<span class="pageNumber"></span>')
        .replace(/\{pagina\}/g, '<span class="pageNumber"></span>')
        .replace(/\{total_pages\}/g, '<span class="totalPages"></span>')
        .replace(/\{total_paginas\}/g, '<span class="totalPages"></span>')
        .replace(/\{total\}/g, '<span class="totalPages"></span>')
        .replace(/\{curso\}/g, courseName)
        .replace(/\{course_name\}/g, courseName)
        .replace(/\{temas\}/g, 'Temas Consolidados')
        .replace(/\{week_number\}/g, String(wNum))
        .replace(/\{semana_numero\}/g, String(wNum))
        .replace(/\{material_titulo\}/g, tplName)
        .replace(/\{template_name\}/g, tplName)
        .replace(
          /\{fecha_generacion\}/g,
          new Date().toLocaleDateString('es-ES'),
        )
        .replace(/\{institucion_nombre\}/g, instName)
        .replace(/\{cycle_name\}/g, cycleName)
        .replace(/\{ciclo_nombre\}/g, cycleName);
    };

    const buildGridHtml = (config: any, isHeader: boolean) => {
      if (!config) return '<span></span>';
      const left = config.left ? resolveVars(config.left) : '';
      const center = config?.center ? resolveVars(config.center) : '';
      const right = config?.right ? resolveVars(config.right) : '';
      return `
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: ${isHeader ? 'flex-end' : 'center'};">
          <div style="flex: 1; text-align: left;">${(left.includes('http') || left.includes('data:image')) && !left.includes('<img') ? `<img src="${left}" style="height: 35px; object-fit: contain;">` : left}</div>
          <div style="flex: 1; text-align: center;">${(center.includes('http') || center.includes('data:image')) && !center.includes('<img') ? `<img src="${center}" style="height: 35px; object-fit: contain;">` : center}</div>
          <div style="flex: 1; text-align: right;">${(right.includes('http') || right.includes('data:image')) && !right.includes('<img') ? `<img src="${right}" style="height: 35px; object-fit: contain;">` : right}</div>
        </div>
      `;
    };

    const footerTemplate = buildGridHtml(resolvedDesign.footerConfig, false);

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      const playwrightHeader = buildGridHtml(resolvedDesign.headerConfig, true);

      const marginTop = resolvedDesign.marginTop || '3cm';
      const marginBottom = resolvedDesign.marginBottom || '1.5cm';
      const marginLeft = resolvedDesign.marginInside || '1cm';
      const marginRight = resolvedDesign.marginOutside || '1cm';

      const contentPdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: marginTop,
          right: marginRight,
          bottom: marginBottom,
          left: marginLeft,
        },
        displayHeaderFooter: true,
        headerTemplate: playwrightHeader,
        footerTemplate: footerTemplate,
      });

      const blocksConfig = resolvedDesign.blocksConfig || [
        'cover',
        'banner',
        'topics',
        'content',
      ];
      if (
        blocksConfig.includes('cover') &&
        resolvedDesign.showCover &&
        resolvedDesign.coverImageUrl
      ) {
        const coverHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; }
            .cover { width: 100vw; height: 100vh; background-image: url('${resolvedDesign.coverImageUrl}'); background-size: cover; background-position: center; }
          </style>
        </head>
        <body><div class="cover"></div></body>
        </html>`;

        const coverPage = await browser.newPage();
        await coverPage.setContent(coverHtml, { waitUntil: 'networkidle' });
        const coverPdfBuffer = await coverPage.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          displayHeaderFooter: false,
        });

        const mergedPdf = await PDFDocument.create();
        const coverPdf = await PDFDocument.load(coverPdfBuffer);
        const contentPdf = await PDFDocument.load(contentPdfBuffer);

        const coverPages = await mergedPdf.copyPages(
          coverPdf,
          coverPdf.getPageIndices(),
        );
        coverPages.forEach((p) => mergedPdf.addPage(p));

        const contentPages = await mergedPdf.copyPages(
          contentPdf,
          contentPdf.getPageIndices(),
        );
        contentPages.forEach((p) => mergedPdf.addPage(p));

        return Buffer.from(await mergedPdf.save());
      }

      return contentPdfBuffer;
    } catch (error: any) {
      this.logger.error(
        `Failed to generate PDF with Playwright: ${error.message}`,
      );
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private buildHtml(
    tenant: any,
    courseId: string,
    questions: ExtractedQuestion[],
    design?: DesignTemplateConfig | null,
    weekNumber?: number,
    templateName?: string,
    withSolution = false,
    withKeysTable = false,
  ): string {
    const primaryTitleColor = design?.primaryTitleColor || '2, 113, 184';
    const secondaryTitleColor = design?.secondaryTitleColor || '2, 113, 184';
    const backgroundHighlightColor =
      design?.backgroundHighlightColor || '214, 238, 253';

    const marginTop = design?.marginTop || '3cm';
    const marginBottom = design?.marginBottom || '1.5cm';
    const marginInside = design?.marginInside || '1cm';
    const marginOutside = design?.marginOutside || '1cm';
    const isBookMode = design?.isBookMode || false;

    const fontFamily = design?.fontFamily || 'Arial';
    const fontFamilyEncoded = fontFamily.replace(/ /g, '+');
    const borderRadius = design?.borderRadius || '4px';

    const blocksConfig = design?.blocksConfig || [
      'cover',
      'banner',
      'topics',
      'content',
    ];

    const wNum = weekNumber || 1;
    const tplName = templateName || 'Material';
    const courseName = tenant.commercial_name || courseId;
    const cycleName = tenant.cycle_name || '';

    const resolveVars = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/\{page\}/g, '<span class="pageNumber"></span>')
        .replace(/\{pagina\}/g, '<span class="pageNumber"></span>')
        .replace(/\{total\}/g, '<span class="totalPages"></span>')
        .replace(/\{total_pages\}/g, '<span class="totalPages"></span>')
        .replace(/\{total_paginas\}/g, '<span class="totalPages"></span>')
        .replace(/\{curso\}/g, courseName)
        .replace(/\{course_name\}/g, courseName)
        .replace(/\{week_number\}/g, String(wNum))
        .replace(/\{semana_numero\}/g, String(wNum))
        .replace(/\{material_titulo\}/g, tplName)
        .replace(/\{template_name\}/g, tplName)
        .replace(/\{cycle_name\}/g, cycleName)
        .replace(/\{ciclo_nombre\}/g, cycleName);
    };

    const headerTitle = resolveVars('{template_name}');
    const logoHtml = '';

    const bannerStyle = design?.bannerImageUrl
      ? `background-image: url('${design.bannerImageUrl}');`
      : `background-color: transparent;`;

    const watermarkHtml = design?.watermarkImageUrl
      ? `<img src="${design.watermarkImageUrl}" alt="Watermark">`
      : '';

    const questionsHtml = questions
      .map((q, index) => {
        // 1. Determine columns layout
        const colsClass = `alternatives--cols-${q.configAlternative?.columns || 1}`;

        // 2. Render alternatives
        const alternativesHtml = (q.options || [])
          .map((opt) => {
            const isCorrectClass = withSolution && opt.isCorrect ? 'alternative__bg--correct' : '';
            return `
              <div class="alternative__item">
                  <div class="alternative__letter">${opt.label})</div>
                  <div class="alternative__text">
                    <span class="alternative__bg ${isCorrectClass}">${opt.text}</span>
                  </div>
              </div>
            `;
          })
          .join('');

        // 3. Render attached images
        const imagesHtml = (q.images || [])
          .map((img) => `<img src="${img.url}" class="question__image-attached" />`)
          .join('');

        // 4. Render university origin if present
        const originHtml = q.textOrigin
          ? `<span class="question__origin">(${q.textOrigin})</span>`
          : '';

        // 5. Render solution block if withSolution is true
        let solutionHtml = '';
        if (withSolution && q.solution) {
          const stepsHtml = (q.solution.diagrammed || [])
            .map(
              (step) => `
              <div class="solution__step">
                <span class="solution__step-name">${step.field_diagram}:</span> ${step.value}
              </div>
            `,
            )
            .join('');

          const solImagesHtml = (q.solution.diagrammedImages || [])
            .map((img) => `<img src="${img.url}" class="solution__image" />`)
            .join('');

          solutionHtml = `
            <div class="solution__box">
                <div class="solution__title">Resolución Paso a Paso:</div>
                <div class="solution__steps">${stepsHtml}</div>
                <div class="solution__images">${solImagesHtml}</div>
            </div>
          `;
        }

        return `
        <div class="question__block">
            <div class="question__container">
                <div class="question__number">${index + 1}.</div>
                <div class="question__content">
                    <div class="question__description">
                        ${q.content} ${originHtml}
                    </div>
                    ${imagesHtml}
                    <div class="alternatives__grid ${colsClass}">
                        ${alternativesHtml}
                    </div>
                    ${solutionHtml}
                </div>
            </div>
        </div>
      `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Material | Odiseo Software</title>
    ${fontFamily !== 'Arial' ? `<link href="https://fonts.googleapis.com/css2?family=${fontFamilyEncoded}:wght@400;700&display=swap" rel="stylesheet">` : ''}
    <style>
        :root {
            --width-page: 100%;
            --correct-answer: #00ff00;
            --text-color: ${design?.contentTextColor || '#000000'};
            --text-font-family: ${design?.fontFamily || 'Arial'}, "Roboto", sans-serif;
            --text-font-size: ${design?.contentFontSize || '11pt'};
            --text-line-height: 1.15;
            --title-font-family: '${fontFamily}', "Roboto", sans-serif;
            --title-font-size: 14pt;
            --title-line-height: 1.15;

            /* Temática (Odiseo / Vonex) */
            --v-theme-primary-title: ${primaryTitleColor};
            --v-theme-secondary-title: ${secondaryTitleColor};
            --v-theme-primary-background: ${backgroundHighlightColor};

            --border-radius-base: ${borderRadius};

            /* CKEditor Spacing */
            --ck-inline-image-style-spacing: 0.75em;
            --ck-image-style-spacing: 1.5em;
        }

        ${
          isBookMode
            ? `
        @page :left {
            margin: ${marginTop} ${marginOutside} ${marginBottom} ${marginInside};
        }
        @page :right {
            margin: ${marginTop} ${marginInside} ${marginBottom} ${marginOutside};
        }
        `
            : `
        @page {
            size: A4;
            margin: ${marginTop} ${marginOutside} ${marginBottom} ${marginInside};
        }
        `
        }

        @page:first {
            margin-top: 0;
        }

        html,
        body {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            color: var(--text-color);
            font-family: var(--text-font-family);
            font-size: var(--text-font-size);
            line-height: var(--text-line-height);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        *,
        *:before,
        *:after {
            box-sizing: inherit;
        }

        h1,
        p,
        figure {
            margin: 0;
        }

        ul,
        ol {
            margin: 0;
            padding-left: 22px;
        }

        a {
            text-decoration: none;
            color: inherit;
        }

        img {
            max-width: 100%;
            height: auto !important;
            display: block;
        }

        .layout__banner-hero {
            width: var(--width-page);
            height: 4cm;
            display: flex;
            align-items: center;
            margin-left: -1cm;
            margin-bottom: 0.5cm;
            position: relative;
        }

        .header__logo-container {
            position: absolute;
            left: 1cm;
            z-index: 60;
            top: 50%;
            transform: translateY(-50%);
        }

        .header__logo {
            max-width: 120px;
        }

        .header__banner {
            width: 100%;
            height: 100%;
            background-size: 100% 100%;
            background-position: center;
            background-repeat: no-repeat;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .header__title {
            color: rgb(var(--v-theme-primary-title));
            font-size: 17.25pt;
            font-weight: bold;
            text-transform: uppercase;
            text-align: center;
            width: 60%;
        }

        .header__subtitles {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px 10px 10px;
        }

        .header__course {
            font-weight: bold;
            font-size: 10pt;
            font-style: italic;
            color: rgb(var(--v-theme-secondary-title));
            margin-right: 20px;
        }

        .header__cycle {
            font-weight: bold;
            font-size: 10pt;
            font-style: italic;
            color: rgb(var(--v-theme-secondary-title));
            margin-left: 20px;
        }

        .layout__watermark-fixed {
            position: fixed;
            top: 20%;
            left: 1cm;
            width: calc(100% - 2cm);
            height: 60%;
            z-index: 10;
            opacity: 0.1;
            pointer-events: none;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .layout__watermark-fixed img {
            width: 100%;
            object-fit: contain;
        }

        .content__wrapper {
            width: 100%;
            margin-top: 0.5cm;
        }

        .columns-2 {
            column-count: 2;
            column-gap: 1cm;
            column-fill: balance;
        }

        .columns-1 {
            column-count: 1;
        }

        .keys-table__container {
            margin-top: 40px;
            padding: 20px;
            border: 2px solid rgb(${primaryTitleColor});
            border-radius: ${borderRadius};
            background-color: rgb(${backgroundHighlightColor});
            page-break-inside: avoid;
            column-span: all;
        }
        .keys-table__title {
            font-size: 14pt;
            font-weight: bold;
            color: rgb(${primaryTitleColor});
            margin-bottom: 15px;
            text-align: center;
            letter-spacing: 1px;
        }
        .keys-table__grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 10px;
        }
        .keys-table__cell {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 8px;
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            font-size: 11pt;
            font-weight: bold;
        }
        .keys-table__num {
            font-size: 9pt;
            color: #64748b;
            margin-bottom: 2px;
        }
        .keys-table__letter {
            color: rgb(${primaryTitleColor});
            font-size: 12pt;
        }

        .section__title {
            text-transform: uppercase;
            color: rgb(var(--v-theme-secondary-title));
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            padding: 20px 0 10px 0;
            column-span: all;
        }

        .question__block {
            break-inside: auto;
            margin-bottom: 0.5cm;
        }

        .question__container {
            display: grid;
            grid-template-columns: 0.65cm 1fr;
            column-gap: 0.1cm;
            align-items: baseline;
            break-inside: avoid;
        }

        .question__number {
            font-weight: bold;
            color: rgb(var(--v-theme-secondary-title));
        }

        .question__description {
            text-align: justify;
            word-break: break-word;
            hyphens: auto;
            margin-bottom: 0.2cm;
        }

        .alternatives__grid {
            display: grid;
            gap: 0.1cm;
            width: 100%;
        }

        .alternatives--cols-1 {
            grid-template-columns: 1fr;
        }

        .alternatives--cols-2 {
            grid-template-columns: repeat(2, 1fr);
        }

        .alternatives--cols-3 {
            grid-template-columns: repeat(3, 1fr);
        }

        .alternatives--cols-5 {
            grid-template-columns: repeat(5, 1fr);
        }

        .alternative__item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            font-size: var(--text-font-size);
            color: var(--text-color);
        }

        .alternative__bg {
            display: inline-block;
            padding: 3px 6px;
            border-radius: var(--border-radius-base);
        }

        .alternative__letter {
            font-weight: bold;
            color: rgb(var(--v-theme-secondary-title));
            white-space: nowrap;
        }

        .alternative__text {
            word-break: break-word;
        }

        .alternative__bg {
            display: inline-block;
            position: relative;
            padding: 2px 4px;
            border-radius: 6px;
        }

        .topics__container {
            margin-bottom: 0.5cm;
            padding: 15px;
            background-color: rgba(var(--v-theme-primary-background), 0.1);
            border-left: 4px solid rgb(var(--v-theme-primary-title));
            border-radius: var(--border-radius-base);
        }
        .topics__title {
            color: rgb(var(--v-theme-primary-title));
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        .topics__list {
            margin: 0;
            padding-left: 20px;
            font-size: 10pt;
            color: var(--text-color);
        }

        /* Correct alternative styling */
        .alternative__bg--correct {
            background-color: #d4edda !important;
            border: 1px dashed #28a745;
            font-weight: bold;
        }

        /* Solution step container */
        .solution__box {
            margin-top: 10px;
            padding: 10px;
            background-color: #f8f9fa;
            border-left: 3px solid rgb(var(--v-theme-primary-title));
            border-radius: var(--border-radius-base);
            font-size: calc(var(--text-font-size) - 1.5pt);
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .solution__title {
            font-weight: bold;
            color: rgb(var(--v-theme-primary-title));
            margin-bottom: 5px;
        }

        .solution__step-name {
            font-weight: bold;
        }

        .question__origin {
            font-weight: bold;
            font-style: italic;
            color: #6c757d;
        }

        .question__image-attached {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
            display: block;
        }

        .solution__image {
            max-width: 100%;
            height: auto;
            margin: 5px 0;
            display: block;
        }
    </style>
    <style>
      .layout__banner-hero {
          margin-left: -${marginInside};
      }
    </style>
</head>
<body>
    ${blocksConfig
      .map((block: string) => {
        if (block === 'banner') {
          return `
        <div class="layout__banner-hero">
            <div class="header__logo-container">
                ${logoHtml}
            </div>
            <div class="header__banner" style="${bannerStyle}">
                <h1 class="header__title">${headerTitle}</h1>
                <div class="header__subtitles">
                    <span class="header__cycle">${cycleName}</span>
                    <span class="header__course">${courseName}</span>
                </div>
            </div>
        </div>`;
        }
        if (block === 'content') {
          let keysTableHtml = '';
          if (withKeysTable) {
            const keysGridHtml = questions
              .map((q, idx) => {
                const correctOpt = (q.options || []).find((opt) => opt.isCorrect);
                const correctLetter = correctOpt ? correctOpt.label : '-';
                return `
                  <div class="keys-table__cell">
                    <span class="keys-table__num">${idx + 1}</span>
                    <span class="keys-table__letter">${correctLetter}</span>
                  </div>
                `;
              })
              .join('');

            keysTableHtml = `
              <div class="keys-table__container">
                <div class="keys-table__title">CLAVES DE RESPUESTAS</div>
                <div class="keys-table__grid">
                  ${keysGridHtml}
                </div>
              </div>
            `;
          }

          return `
        <div class="layout__watermark-fixed">
            ${watermarkHtml}
        </div>
        <div class="content__wrapper columns-2">
            ${questionsHtml}
        </div>
        ${keysTableHtml}`;
        }
        return '';
      })
      .join('')}
</body>
</html>`;
  }
}
