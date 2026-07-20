import { setupCorrelationId } from './correlation-id.setup';
import {
  REQUEST_ID_CLS_KEY,
  REQUEST_ID_HEADER,
} from './correlation-id.constants';

describe('setupCorrelationId', () => {
  let cls: { set: jest.Mock };
  let res: { setHeader: jest.Mock };

  beforeEach(() => {
    cls = { set: jest.fn() };
    res = { setHeader: jest.fn() };
  });

  const makeReq = (headers: Record<string, unknown>) => ({ headers }) as any;

  it('honors a caller-supplied x-request-id instead of generating a new one', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: 'caller-supplied-id' });

    setupCorrelationId(cls as any, req, res as any);

    expect(cls.set).toHaveBeenCalledWith(
      REQUEST_ID_CLS_KEY,
      'caller-supplied-id',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'caller-supplied-id',
    );
  });

  it('generates a new id when the header is absent', () => {
    const req = makeReq({});

    setupCorrelationId(cls as any, req, res as any);

    const [, generatedId] = cls.set.mock.calls[0];
    expect(typeof generatedId).toBe('string');
    expect(generatedId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, generatedId);
  });

  it('generates a new id when the header is present but blank', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: '   ' });

    setupCorrelationId(cls as any, req, res as any);

    const [, generatedId] = cls.set.mock.calls[0];
    expect(generatedId).not.toBe('   ');
    expect(generatedId.length).toBeGreaterThan(0);
  });

  it('uses the first value when the header is duplicated', () => {
    const req = makeReq({ [REQUEST_ID_HEADER]: ['first-id', 'second-id'] });

    setupCorrelationId(cls as any, req, res as any);

    expect(cls.set).toHaveBeenCalledWith(REQUEST_ID_CLS_KEY, 'first-id');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'first-id');
  });

  it('always echoes the same id used for CLS on the response header', () => {
    const req = makeReq({});

    setupCorrelationId(cls as any, req, res as any);

    const [, clsId] = cls.set.mock.calls[0];
    const [, headerId] = res.setHeader.mock.calls[0];
    expect(headerId).toBe(clsId);
  });
});
