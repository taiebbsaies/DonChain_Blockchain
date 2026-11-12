import PDFDocument from 'pdfkit';
import type { CampaignView } from './explorer.service.js';
import { formatUnits6, type FlowRow } from './flows.js';

/** Relevé PDF du flux des fonds d'une campagne (§4.5). Données publiques uniquement. */
export function campaignPdf(c: CampaignView, flows: FlowRow[], chainId: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `DonChain - campagne ${c.id}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usdc = (v: string) => `${formatUnits6(v) || '0'} USDC`;
    doc.fontSize(18).text(`DonChain - relevé de la campagne #${c.id}`);
    doc.moveDown(0.3).fontSize(9).fillColor('#555').text(
      `Généré le ${new Date().toISOString().slice(0, 10)} depuis l'index de la chaîne ${chainId}. ` +
        'La blockchain fait foi : chaque ligne renvoie à une transaction vérifiable.',
    );
    doc.moveDown().fillColor('#000').fontSize(10);
    doc.text(`Organisation : ${c.org}`);
    doc.text(`Coffre (séquestre) : ${c.vault}`);
    doc.text(`Suivi des jalons : ${c.tracker}`);
    doc.moveDown(0.5);
    doc.text(`Collecté : ${usdc(c.totals.raised)}   Payé aux prestataires : ${usdc(c.totals.released)}`);
    doc.text(`Remboursé : ${usdc(c.totals.refunded)}   Sous séquestre : ${usdc(c.totals.inEscrow)}`);
    doc.text(`Donateurs : ${c.donors}   Jalons : ${c.milestones}   Contestations : ${c.disputes}`);

    doc.moveDown().fontSize(12).text('Flux des fonds et étapes');
    doc.moveDown(0.3).fontSize(8);
    for (const f of flows) {
      if (doc.y > 760) doc.addPage();
      const date = new Date(f.time * 1000).toISOString().replace('T', ' ').slice(0, 16);
      const amount = f.amount ? `  ${formatUnits6(f.amount)} USDC` : '';
      const ms = f.milestoneId === null ? '' : `  [jalon ${f.milestoneId + 1}]`;
      doc.fillColor('#000').text(`${date}  ${f.label}${ms}${amount}`);
      doc.fillColor('#777').text(`    bloc ${f.block}  tx ${f.txHash}${f.party ? `  ${f.party}` : ''}`);
    }
    doc.end();
  });
}
