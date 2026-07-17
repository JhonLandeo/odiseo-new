export class TenantProvisioningEvent {
  constructor(
    public readonly schemaName: string,
    public readonly companyId: string,
  ) {}
}
