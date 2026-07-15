export class TenantProvisioningEvent {
  constructor(
    public readonly schemaName: string,
    public readonly companyId: string,
    public readonly adminEmail: string,
    public readonly adminPasswordHash: string,
  ) {}
}
