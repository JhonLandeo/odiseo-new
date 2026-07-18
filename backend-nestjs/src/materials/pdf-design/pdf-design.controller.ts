import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { PdfDesignService } from './pdf-design.service';
import { CreatePdfDesignDto } from '../dto/create-pdf-design.dto';

@ApiTags('PDF Designs')
@Controller('v1/pdf-designs')
export class PdfDesignController {
  constructor(
    private readonly pdfDesignService: PdfDesignService,
    private readonly cls: ClsService,
  ) {}

  private getTenantId(): string {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new UnauthorizedException('Tenant not identified');
    }
    return tenantId;
  }

  @Get()
  @ApiOperation({ summary: 'List all design templates' })
  async findAll() {
    return this.pdfDesignService.findAll(this.getTenantId());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get design template by id' })
  async findById(@Param('id') id: string) {
    return this.pdfDesignService.findById(id, this.getTenantId());
  }

  @Post()
  @ApiOperation({ summary: 'Create design template' })
  async create(@Body() dto: CreatePdfDesignDto) {
    return this.pdfDesignService.create(this.getTenantId(), dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update design template' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePdfDesignDto>,
  ) {
    const tenantId = this.getTenantId();
    await this.pdfDesignService.update(id, tenantId, dto);
    return this.pdfDesignService.findById(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete design template' })
  async delete(@Param('id') id: string) {
    await this.pdfDesignService.delete(id, this.getTenantId());
  }

  @Post(':id/upload-asset')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload logo, banner, or watermark for design template',
  })
  @ApiConsumes('multipart/form-data')
  async uploadAsset(
    @Param('id') id: string,
    @Query('type') type: 'banner' | 'watermark' | 'grid_image' | 'cover',
    @UploadedFile() file: Express.Multer.File,
  ) {
    const url = await this.pdfDesignService.uploadAsset(
      id,
      this.getTenantId(),
      file,
      type,
    );
    return { url };
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Generate HTML preview of design template' })
  async preview(
    @Param('id') id: string,
    @Body() body?: Record<string, any>,
  ) {
    return this.pdfDesignService.generatePreview(
      this.getTenantId(),
      id,
      body,
    );
  }

  @Delete(':id/asset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete asset from design template' })
  async deleteAsset(
    @Param('id') id: string,
    @Query('type') type: 'banner' | 'watermark' | 'cover',
  ) {
    await this.pdfDesignService.deleteAsset(
      id,
      this.getTenantId(),
      type,
    );
  }
}
