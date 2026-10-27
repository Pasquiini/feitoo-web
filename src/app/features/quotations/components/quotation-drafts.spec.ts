import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../auth/services/auth.service';
import { QuotationDraftApi } from '../services/quotation-draft-api.service';
import { QuotationDraftCoordinator } from '../services/quotation-draft.coordinator';
import { QuotationDrafts } from './quotation-drafts';

describe('saved quotation drafts', () => {
  const user = signal<{ id: number } | null>({ id: 1 });
  const result = {
    data: [
      {
        uuid: 'draft-1',
        number: 'ORC-1',
        customer_name: 'Cliente privado',
        template_id: 'classic',
        expires_at: '2026-10-28T12:00:00Z',
      },
    ],
    meta: { current_page: 1, last_page: 2, total: 11 },
  };
  let list: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    user.set({ id: 1 });
    list = vi.fn(async () => result);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: QuotationDraftApi, useValue: { list } },
        {
          provide: QuotationDraftCoordinator,
          useValue: {
            loading: signal(false),
            conflict: signal(false),
            open: vi.fn(async () => true),
            newDraft: vi.fn(async () => {}),
          },
        },
      ],
    });
  });
  it('loads on request and paginates without issuing a document', async () => {
    const fixture = TestBed.createComponent(QuotationDrafts);
    fixture.detectChanges();
    expect(list).not.toHaveBeenCalled();
    await fixture.componentInstance.load(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cliente privado');
    list.mockResolvedValue({ ...result, meta: { ...result.meta, current_page: 2 } });
    await fixture.componentInstance.load(2);
    expect(list).toHaveBeenLastCalledWith(2);
    expect(fixture.componentInstance.page()).toBe(2);
  });
  it('clears private rows and rejects an old response when the account changes', async () => {
    const fixture = TestBed.createComponent(QuotationDrafts);
    fixture.detectChanges();
    await fixture.componentInstance.load(1);
    let complete!: (value: typeof result) => void;
    list.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const pending = fixture.componentInstance.load(2);
    user.set({ id: 2 });
    complete(result);
    await pending;
    fixture.detectChanges();
    expect(fixture.componentInstance.items()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Cliente privado');
  });
});
