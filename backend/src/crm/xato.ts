/** Ichki CRM xizmat xatosi — HTTP qatlami uni 404/409/400/403 ga aylantiradi. */
export class CrmXatosi extends Error {
  constructor(
    public readonly kod: 'topilmadi' | 'ziddiyat' | 'yaroqsiz' | 'ruxsat',
    message: string,
  ) {
    super(message);
    this.name = 'CrmXatosi';
  }
}
