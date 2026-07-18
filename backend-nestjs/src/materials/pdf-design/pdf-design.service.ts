import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PdfDesignTemplate } from '../entities/pdf-design-template.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { CreatePdfDesignDto } from '../dto/create-pdf-design.dto';
import { S3Service } from '../../aws/s3.service';
import { TenantService } from '../../database/tenant.service';
import sharp from 'sharp';

@Injectable()
export class PdfDesignService {
  private readonly logger = new Logger(PdfDesignService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly s3Service: S3Service,
  ) {}

  async findAll(
    tenantId: string,
  ): Promise<(PdfDesignTemplate & { cycleCount: number })[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const materialRequestRepo = manager.getRepository(MaterialRequest);

      const designs = await designRepo.find({
        where: { tenantId },
        order: { isDefault: 'DESC', createdAt: 'DESC' },
      });

      const counts = await materialRequestRepo
        .createQueryBuilder('mr')
        .select('mr.designTemplateId', 'designTemplateId')
        .addSelect('COUNT(DISTINCT mr.cycleId)', 'count')
        .where('mr.tenantId = :tenantId', { tenantId })
        .andWhere('mr.designTemplateId IS NOT NULL')
        .groupBy('mr.designTemplateId')
        .getRawMany();

      const countMap = new Map<string, number>();
      for (const c of counts) {
        countMap.set(c.designTemplateId, parseInt(c.count, 10));
      }

      return designs.map((design) => ({
        ...design,
        cycleCount: countMap.get(design.id) ?? 0,
      }));
    });
  }

  async findById(id: string, tenantId: string): Promise<PdfDesignTemplate> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const design = await designRepo.findOne({ where: { id, tenantId } });
      if (!design) throw new NotFoundException('Design template not found');
      return design;
    });
  }

  async create(
    tenantId: string,
    dto: CreatePdfDesignDto,
  ): Promise<PdfDesignTemplate> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const existingCount = await designRepo.count({ where: { tenantId } });
      const shouldBeDefault = dto.isDefault ?? existingCount === 0;
      if (shouldBeDefault) {
        await this.unsetCurrentDefault(tenantId);
      }
      const design = designRepo.create({
        ...dto,
        tenantId,
        isDefault: shouldBeDefault,
      });
      return designRepo.save(design);
    });
  }

  // Spec-kit: state-mutating updates mutate and return void. The HTTP layer
  // re-reads the resource to return its representation (see the controller).
  async update(
    id: string,
    tenantId: string,
    dto: Partial<CreatePdfDesignDto>,
  ): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const design = await this.findById(id, tenantId);
      if (dto.isDefault && !design.isDefault) {
        await this.unsetCurrentDefault(tenantId);
      }
      if (dto.isDefault === false && design.isDefault) {
        const defaultCount = await designRepo.count({
          where: { tenantId, isDefault: true },
        });
        if (defaultCount <= 1) {
          throw new ConflictException(
            'Cannot unset the only default design template. Set another as default first.',
          );
        }
      }
      Object.assign(design, dto);
      await designRepo.save(design);
    });
  }

  async delete(id: string, tenantId: string): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const materialRequestRepo = manager.getRepository(MaterialRequest);

      const design = await this.findById(id, tenantId);
      const materialCount = await materialRequestRepo.count({
        where: { designTemplateId: id },
      });
      if (materialCount > 0) {
        throw new ConflictException(
          `Cannot delete design template "${design.name}" because it is used by ${materialCount} material request(s).`,
        );
      }

      // Clean up S3 assets if present
      const assets: ('banner' | 'watermark' | 'cover')[] = [
        'banner',
        'watermark',
        'cover',
      ];
      for (const type of assets) {
        for (const ext of ['png', 'jpg']) {
          try {
            const key = `designs/${tenantId}/${id}-${type}.${ext}`;
            await this.s3Service.deleteObject(key);
          } catch (error) {
            // S3 object might not exist, ignore and proceed
          }
        }
      }

      await designRepo.remove(design);
    });
  }

  async uploadAsset(
    designId: string,
    tenantId: string,
    file: Express.Multer.File,
    type: 'banner' | 'watermark' | 'grid_image' | 'cover',
  ): Promise<string> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const design = await this.findById(designId, tenantId);
      let bufferToUpload = file.buffer;
      let mimeType = file.mimetype;

      if (type === 'grid_image') {
        bufferToUpload = await sharp(file.buffer)
          .resize({ width: 200, withoutEnlargement: true })
          .png({ quality: 80, compressionLevel: 9, palette: true })
          .toBuffer();
        mimeType = 'image/png';
      } else if (type === 'watermark') {
        bufferToUpload = await sharp(file.buffer)
          .resize({ width: 1000, withoutEnlargement: true })
          .png({ quality: 75, compressionLevel: 9, palette: true })
          .toBuffer();
        mimeType = 'image/png';
      } else if (type === 'banner') {
        if (file.mimetype.includes('png')) {
          bufferToUpload = await sharp(file.buffer)
            .resize({ width: 1600, withoutEnlargement: true })
            .png({ quality: 80, compressionLevel: 9, palette: true })
            .toBuffer();
        } else {
          bufferToUpload = await sharp(file.buffer)
            .resize({ width: 1600, withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          mimeType = 'image/jpeg';
        }
      } else if (type === 'cover') {
        if (file.mimetype.includes('png')) {
          bufferToUpload = await sharp(file.buffer)
            .resize({ width: 1600, withoutEnlargement: true })
            .png({ quality: 80, compressionLevel: 9, palette: true })
            .toBuffer();
        } else {
          bufferToUpload = await sharp(file.buffer)
            .resize({ width: 1600, withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          mimeType = 'image/jpeg';
        }
      }

      const keySuffix = type === 'grid_image' ? `grid-${Date.now()}` : type;
      const extension = mimeType === 'image/png' ? 'png' : 'jpg';
      const key = `designs/${tenantId}/${designId}-${keySuffix}.${extension}`;
      const url = await this.s3Service.uploadBuffer(
        key,
        bufferToUpload,
        mimeType,
      );

      if (type === 'banner') {
        design.bannerImageUrl = url;
      } else if (type === 'watermark') {
        design.watermarkImageUrl = url;
      } else if (type === 'cover') {
        design.coverImageUrl = url;
      }

      if (type !== 'grid_image') {
        await designRepo.save(design);
      }
      return url;
    });
  }

  async deleteAsset(
    designId: string,
    tenantId: string,
    type: 'banner' | 'watermark' | 'cover',
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      const design = await this.findById(designId, tenantId);
      if (type === 'banner') {
        design.bannerImageUrl = null;
      } else if (type === 'watermark') {
        design.watermarkImageUrl = null;
      } else if (type === 'cover') {
        design.coverImageUrl = null;
      }

      for (const ext of ['png', 'jpg']) {
        try {
          const key = `designs/${tenantId}/${designId}-${type}.${ext}`;
          await this.s3Service.deleteObject(key);
        } catch (error) {
          // S3 object might not exist, ignore
        }
      }

      await designRepo.save(design);
    });
  }

  async generatePreview(
    tenantId: string,
    designId: string,
    overrides?: any,
  ): Promise<{ html: string }> {
    let design: Partial<PdfDesignTemplate> = {};
    if (designId && designId !== 'new') {
      try {
        design = await this.findById(designId, tenantId);
      } catch (err) {
        // Ignore if template not found
      }
    }
    if (overrides && Object.keys(overrides).length > 0) {
      design = { ...design, ...overrides };
    }

    const primaryTitleColor = design.primaryTitleColor || '2, 113, 184';
    const secondaryTitleColor = design.secondaryTitleColor || '2, 113, 184';
    const backgroundHighlightColor =
      design.backgroundHighlightColor || '214, 238, 253';

    const marginTop = design.marginTop || '3cm';
    const marginBottom = design.marginBottom || '1.5cm';
    const marginInside = design.marginInside || '1cm';
    const marginOutside = design.marginOutside || '1cm';
    const isBookMode = design.isBookMode || false;

    const wNum = overrides?.weekNumber || overrides?.week_number || 1;
    const tplName =
      overrides?.templateName ||
      overrides?.template_name ||
      'Material de Estudio';
    const courseName =
      overrides?.courseName || overrides?.course_name || 'Aritmética';
    const cycleName =
      overrides?.cycleName || overrides?.cycle_name || 'Ciclo Especial 2026';

    const headerConfig = design.headerConfig || {};
    const footerConfig = design.footerConfig || {};

    const resolveVars = (text: string, pageNum: number): string => {
      if (!text) return '';
      return text
        .replace(/\{page\}/g, String(pageNum))
        .replace(/\{pagina\}/g, String(pageNum))
        .replace(/\{total_pages\}/g, '2')
        .replace(/\{total_paginas\}/g, '2')
        .replace(/\{total\}/g, '2')
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
        .replace(/\{institucion_nombre\}/g, cycleName)
        .replace(/\{cycle_name\}/g, cycleName)
        .replace(/\{ciclo_nombre\}/g, cycleName);
    };

    const buildGridHtml = (config: any, isHeader: boolean, pageNum: number) => {
      const left = config?.left ? resolveVars(config.left, pageNum) : '';
      const center = config?.center ? resolveVars(config.center, pageNum) : '';
      const right = config?.right ? resolveVars(config.right, pageNum) : '';
      return `
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: ${isHeader ? 'flex-end' : 'center'};">
          <div class="grid-zone" style="flex: 1; text-align: left;">${(left.includes('http') || left.includes('data:image')) && !left.includes('<img') ? `<img src="${left}" style="height: 35px; object-fit: contain;">` : left}</div>
          <div class="grid-zone" style="flex: 1; text-align: center;">${(center.includes('http') || center.includes('data:image')) && !center.includes('<img') ? `<img src="${center}" style="height: 35px; object-fit: contain;">` : center}</div>
          <div class="grid-zone" style="flex: 1; text-align: right;">${(right.includes('http') || right.includes('data:image')) && !right.includes('<img') ? `<img src="${right}" style="height: 35px; object-fit: contain;">` : right}</div>
        </div>
      `;
    };

    const focusedSection = (design as any).focusedSection || null;

    const bannerStyle = design.bannerImageUrl
      ? `background-image: url('${design.bannerImageUrl}');`
      : `background-color: transparent;`;

    const watermarkHtml = design.watermarkImageUrl
      ? `<img src="${design.watermarkImageUrl}" alt="Watermark">`
      : '';

    const questionsHtml = `
      <div class="question__block">
          <div class="question__container">
              <div class="question__number">1.</div>
              <div class="question__content">
                  <div class="question__description">
                      <p>Dada la proposición lógica: "Si estudio entonces apruebo". Indique cuál es su equivalente contrarrecíproca.</p>
                  </div>
                  <div class="alternatives__grid alternatives--cols-1">
                      <div class="alternative__item">
                          <div class="alternative__letter">A)</div>
                          <div class="alternative__text"><span class="alternative__bg">Si no estudio entonces apruebo.</span></div>
                      </div>
                      <div class="alternative__item">
                          <div class="alternative__letter">B)</div>
                          <div class="alternative__text"><span class="alternative__bg">Si no apruebo entonces no estudio.</span></div>
                      </div>
                      <div class="alternative__item">
                          <div class="alternative__letter">C)</div>
                          <div class="alternative__text"><span class="alternative__bg">Estudio y no apruebo.</span></div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
      <div class="question__block">
          <div class="question__container">
              <div class="question__number">2.</div>
              <div class="question__content">
                  <div class="question__description">
                      <p>Determine el valor de verdad de las siguientes afirmaciones sobre conjuntos numéricos.</p>
                  </div>
                  <div class="alternatives__grid alternatives--cols-1">
                      <div class="alternative__item">
                          <div class="alternative__letter">A)</div>
                          <div class="alternative__text"><span class="alternative__bg">V - F - V</span></div>
                      </div>
                      <div class="alternative__item">
                          <div class="alternative__letter">B)</div>
                          <div class="alternative__text"><span class="alternative__bg">F - F - V</span></div>
                      </div>
                      <div class="alternative__item">
                          <div class="alternative__letter">C)</div>
                          <div class="alternative__text"><span class="alternative__bg">V - V - V</span></div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    `;

    const getPadding = (isEven: boolean) => {
      if (!isBookMode)
        return `${marginTop} ${marginOutside} ${marginBottom} ${marginInside}`;
      return isEven
        ? `${marginTop} ${marginInside} ${marginBottom} ${marginOutside}` // Left page
        : `${marginTop} ${marginOutside} ${marginBottom} ${marginInside}`; // Right page
    };

    const getPageHtml = (
      contentHtml: string,
      isEven: boolean,
      pageNum: number,
    ) => {
      const headerContentHtml = buildGridHtml(headerConfig, true, pageNum);
      const footerContentHtml = buildGridHtml(footerConfig, false, pageNum);

      return `
      <div class="preview-page" style="padding: ${getPadding(isEven)};">
          <div class="layout__header-fixed ${focusedSection === 'header' ? 'focused-section' : ''}">
              <div class="header__banner" style="${bannerStyle}">
                  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column;">
                     <div style="flex: 1;"></div>
                     <div style="width: 100%; padding: 0 ${isBookMode && isEven ? marginOutside : marginInside} 0.2cm ${isBookMode && isEven ? marginInside : marginOutside};">
                        ${headerContentHtml}
                     </div>
                  </div>
              </div>
          </div>
          <div class="layout__watermark-fixed">${watermarkHtml}</div>
          <div class="content__wrapper columns-2 ${focusedSection ? 'dimmed-section' : ''}">${contentHtml}</div>
          <div class="footer ${focusedSection === 'footer' ? 'focused-section' : ''}" style="padding: 0 ${isBookMode && isEven ? marginOutside : marginInside} 0 ${isBookMode && isEven ? marginInside : marginOutside};">
              <div style="width: 100%;">${footerContentHtml}</div>
          </div>
      </div>
    `;
    };

    let coverPageHtml = '';
    if (design.showCover && design.coverImageUrl) {
      coverPageHtml = `
      <div class="preview-page" style="padding: 0;">
        <div style="width: 100%; height: 100%; background-image: url('${design.coverImageUrl}'); background-size: cover; background-position: center;"></div>
      </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Vista Previa de Diseño</title>
    <style>
        :root {
            --width-page: 100%;
            --correct-answer: #00ff00;
            --text-color: ${design.contentTextColor || '#000000'};
            --text-font-family: ${design.fontFamily || 'Arial'}, "Roboto", sans-serif;
            --text-font-size: ${design.contentFontSize || '11pt'};
            --text-line-height: 1.15;
            --title-font-family: Arial, "Roboto", sans-serif;
            --title-font-size: 14pt;
            --title-line-height: 1.15;
            --v-theme-primary-title: ${primaryTitleColor};
            --v-theme-secondary-title: ${secondaryTitleColor};
            --v-theme-primary-background: ${backgroundHighlightColor};
        }
        html, body {
            box-sizing: border-box; margin: 0; padding: 0; color: var(--text-color);
            font-family: var(--text-font-family); font-size: var(--text-font-size);
            line-height: var(--text-line-height); background-color: transparent;
        }
        *, *:before, *:after { box-sizing: inherit; }
        .preview-page {
            width: 21cm; height: 29.7cm; background-color: #ffffff;
            margin: 0 auto; position: relative; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border-radius: 8px; overflow: hidden; flex-shrink: 0; box-sizing: border-box;
        }
        img { max-width: 100%; height: auto !important; display: block; }
        .layout__header-fixed { position: absolute; top: 0; left: 0; width: 100%; height: ${marginTop}; z-index: 50; display: flex; align-items: center; }
        .header__banner { width: 100%; height: 100%; background-size: 100% 100%; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; position: relative; }
        .layout__watermark-fixed { position: absolute; top: 20%; left: 1cm; width: calc(100% - 2cm); height: 60%; z-index: 10; opacity: 0.1; pointer-events: none; display: flex; justify-content: center; align-items: center; }
        .layout__watermark-fixed img { width: 100%; object-fit: contain; }
        .content__wrapper { width: 100%; margin-top: 0.5cm; }
        .columns-2 { column-count: 2; column-gap: 1cm; column-fill: balance; }
        .question__block { break-inside: auto; margin-bottom: 0.5cm; }
        .question__container { display: grid; grid-template-columns: 0.65cm 1fr; column-gap: 0.1cm; align-items: baseline; break-inside: avoid; }
        .question__number { font-weight: bold; color: rgb(var(--v-theme-secondary-title)); }
        .question__description { text-align: justify; word-break: break-word; hyphens: auto; margin-bottom: 0.2cm; }
        .alternatives__grid { display: grid; gap: 0.1cm; width: 100%; }
        .alternative__item { display: flex; align-items: baseline; gap: 6px; break-inside: avoid; }
        .alternative__letter { font-weight: bold; color: rgb(var(--v-theme-secondary-title)); white-space: nowrap; }
        .alternative__text { word-break: break-word; }
        .alternative__bg { display: inline-block; position: relative; padding: 2px 4px; border-radius: 6px; }
        .footer { position: absolute; bottom: 0; left: 0; width: 100%; height: ${marginBottom}; display: flex; align-items: center; justify-content: center; }
        .preview-container { display: flex; flex-direction: column; gap: 1.5rem; align-items: center; padding: 1.5rem; }
        .focused-section {
          outline: 2px dashed rgb(var(--v-theme-primary-title));
          background: rgba(var(--v-theme-primary-title), 0.05);
          z-index: 100;
          transition: all 0.2s ease;
        }
        .focused-section .grid-zone {
          outline: 1px dashed rgba(var(--v-theme-primary-title), 0.4);
          background: rgba(var(--v-theme-primary-title), 0.03);
          min-height: 1.5rem;
        }
        .dimmed-section {
          opacity: 0.3;
          filter: grayscale(50%);
          pointer-events: none;
          transition: all 0.2s ease;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        ${coverPageHtml}
        ${getPageHtml(questionsHtml, false, 1)}
        ${getPageHtml(questionsHtml, true, 2)}
    </div>
</body>
</html>`;

    return { html };
  }

  private async unsetCurrentDefault(tenantId: string): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const designRepo = manager.getRepository(PdfDesignTemplate);
      await designRepo.update(
        { tenantId, isDefault: true },
        { isDefault: false },
      );
    });
  }
}
