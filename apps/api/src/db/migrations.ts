/**
 * Migrations SQL, appliquées dans l'ordre au démarrage (une seule fois chacune).
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
      create table siwe_nonces (
        nonce text primary key,
        expires_at timestamptz not null
      );

      -- Fichiers téléversés (preuves, documents, métadonnées). Aucune donnée personnelle (§12).
      create table files (
        cid text primary key,
        sha256 text not null,
        size integer not null,
        mime text not null,
        kind text not null,
        uploader text not null,
        created_at timestamptz not null default now(),
        primary_pin text,
        secondary_pin text,
        -- Contenu conservé seulement en mode local (sans Pinata), servi par GET /ipfs/:cid
        content bytea
      );

      create table indexer_state (
        chain_id integer primary key,
        last_block bigint not null
      );

      -- Empreintes des blocs indexés, pour détecter les réorganisations
      create table indexed_blocks (
        chain_id integer not null,
        number bigint not null,
        hash text not null,
        primary key (chain_id, number)
      );

      create table campaigns (
        chain_id integer not null,
        campaign_id integer not null,
        org text not null,
        vault text not null,
        tracker text not null,
        metadata_uri text not null,
        soft_cap numeric(78, 0) not null,
        hard_cap numeric(78, 0) not null,
        funding_deadline bigint not null,
        block_number bigint not null,
        tx_hash text not null,
        primary key (chain_id, campaign_id)
      );
      create index campaigns_vault on campaigns (chain_id, vault);
      create index campaigns_tracker on campaigns (chain_id, tracker);

      create table events (
        chain_id integer not null,
        block_number bigint not null,
        block_hash text not null,
        block_time bigint not null,
        tx_hash text not null,
        log_index integer not null,
        address text not null,
        contract text not null,
        campaign_id integer,
        event_name text not null,
        args jsonb not null,
        primary key (chain_id, tx_hash, log_index)
      );
      create index events_campaign on events (chain_id, campaign_id, block_number, log_index);
      create index events_block on events (chain_id, block_number);
    `,
  },
];
