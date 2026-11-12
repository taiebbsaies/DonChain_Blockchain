import { rawCid, sniffMime } from './content.js';

describe('contenu téléversé', () => {
  it('reconnaît les types par signature binaire', () => {
    expect(sniffMime(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('{"a":1}'))).toBe('application/json');
    expect(sniffMime(Buffer.from('"juste une chaîne"'))).toBeNull();
    expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });

  it('calcule le CID v1 raw attendu (vecteur IPFS connu)', async () => {
    // `echo -n hello | ipfs add --cid-version 1 --raw-leaves -Q`
    expect(await rawCid(Buffer.from('hello'))).toBe('bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq');
  });
});
