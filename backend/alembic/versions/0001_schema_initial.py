"""schema initial

Revision ID: 0001
Revises: 
Create Date: 2026-10-26 22:12:08.049175
"""
from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extensions : PostGIS (géo), pgvector (sémantique), pg_trgm (recherche floue), unaccent (accents)
    for ext in ("postgis", "vector", "pg_trgm", "unaccent"):
        op.execute(f"CREATE EXTENSION IF NOT EXISTS {ext}")
    op.execute(
        "CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT "
        "AS $$ SELECT public.unaccent('public.unaccent', $1) $$"
    )
    op.create_table('ambiances',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('icon', sa.String(length=64), nullable=False),
    sa.Column('sort', sa.SmallInteger(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_geospatial_table('cities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('country_code', sa.String(length=2), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('center', Geography(geometry_type='POINT', srid=4326, spatial_index=False, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_geospatial_index('idx_cities_center', 'cities', ['center'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('data_sources',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('license', sa.String(length=120), nullable=True),
    sa.Column('attribution', sa.String(length=255), nullable=True),
    sa.CheckConstraint("kind in ('demo','osm','partner','curated','user')"),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('partners',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('contact_email', sa.String(length=255), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('plans',
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('price_fcfa', sa.Integer(), nullable=True),
    sa.Column('concierge_per_day', sa.Integer(), nullable=False),
    sa.Column('itinerary_max_steps', sa.SmallInteger(), nullable=False),
    sa.Column('can_see_gems', sa.Boolean(), nullable=False),
    sa.Column('features', sa.ARRAY(sa.String(length=160)), nullable=False),
    sa.Column('sort', sa.SmallInteger(), nullable=False),
    sa.PrimaryKeyConstraint('code')
    )
    op.create_table('tags',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_geospatial_table('districts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('city_id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('center', Geography(geometry_type='POINT', srid=4326, spatial_index=False, from_text='ST_GeogFromText', name='geography'), nullable=True),
    sa.ForeignKeyConstraint(['city_id'], ['cities.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('city_id', 'slug')
    )
    op.create_geospatial_index('idx_districts_center', 'districts', ['center'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('display_name', sa.String(length=80), nullable=False),
    sa.Column('role', sa.String(length=10), nullable=False),
    sa.Column('plan_code', sa.String(length=16), nullable=False),
    sa.Column('location_consent', sa.Boolean(), nullable=False),
    sa.Column('location_consent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role in ('user','curator','admin')", name='ck_users_role'),
    sa.ForeignKeyConstraint(['plan_code'], ['plans.code'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email_lower', 'users', [sa.literal_column('lower(email)')], unique=True)
    op.create_table('audit_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=60), nullable=False),
    sa.Column('entity_type', sa.String(length=40), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_created', 'audit_log', ['created_at'], unique=False)
    op.create_index('ix_audit_entity', 'audit_log', ['entity_type', 'entity_id'], unique=False)
    op.create_table('collections',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=False),
    sa.Column('is_editorial', sa.Boolean(), nullable=False),
    sa.Column('premium_only', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_collections_user', 'collections', ['user_id'], unique=False)
    op.create_table('concierge_usage',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'day')
    )
    op.create_table('itineraries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('day', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_itineraries_user', 'itineraries', ['user_id', 'created_at'], unique=False)
    op.create_geospatial_table('places',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('slug', sa.String(length=160), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('short_description', sa.String(length=280), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('city_id', sa.Integer(), nullable=False),
    sa.Column('district_id', sa.Integer(), nullable=True),
    sa.Column('address', sa.String(length=255), nullable=True),
    sa.Column('location', Geography(geometry_type='POINT', srid=4326, spatial_index=False, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.Column('phone', sa.String(length=40), nullable=True),
    sa.Column('website', sa.String(length=255), nullable=True),
    sa.Column('price_level', sa.SmallInteger(), nullable=True),
    sa.Column('budget_min_fcfa', sa.Integer(), nullable=True),
    sa.Column('budget_max_fcfa', sa.Integer(), nullable=True),
    sa.Column('tier', sa.String(length=8), nullable=False),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('source_id', sa.Integer(), nullable=True),
    sa.Column('external_ref', sa.String(length=120), nullable=True),
    sa.Column('partner_id', sa.UUID(), nullable=True),
    sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('confidence', sa.Float(), nullable=False),
    sa.Column('rating_avg', sa.Float(), nullable=True),
    sa.Column('rating_count', sa.Integer(), nullable=False),
    sa.Column('popularity', sa.Integer(), nullable=False),
    sa.Column('category_slugs', sa.ARRAY(sa.String(length=64)), nullable=False),
    sa.Column('ambiance_slugs', sa.ARRAY(sa.String(length=64)), nullable=False),
    sa.Column('cover_key', sa.String(length=255), nullable=True),
    sa.Column('cover_gradient', sa.ARRAY(sa.String(length=9)), nullable=False),
    sa.Column('has_parking', sa.Boolean(), nullable=True),
    sa.Column('wheelchair', sa.Boolean(), nullable=True),
    sa.Column('wifi', sa.Boolean(), nullable=True),
    sa.Column('card_payment', sa.Boolean(), nullable=True),
    sa.Column('mobile_money', sa.Boolean(), nullable=True),
    sa.Column('outdoor', sa.Boolean(), nullable=True),
    sa.Column('reviews_summary', sa.Text(), nullable=True),
    sa.Column('search_vector', postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', f_unaccent(coalesce(name,'') || ' ' || coalesce(short_description,'') || ' ' || coalesce(description,'')))", persisted=True), nullable=True),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status in ('draft','published','closed','archived')", name='ck_places_status'),
    sa.CheckConstraint("tier in ('free','premium')", name='ck_places_tier'),
    sa.CheckConstraint('budget_min_fcfa is null or budget_max_fcfa is null or budget_min_fcfa <= budget_max_fcfa', name='ck_places_budget'),
    sa.CheckConstraint('confidence between 0 and 1', name='ck_places_confidence'),
    sa.CheckConstraint('price_level between 1 and 4', name='ck_places_price_level'),
    sa.ForeignKeyConstraint(['city_id'], ['cities.id'], ),
    sa.ForeignKeyConstraint(['district_id'], ['districts.id'], ),
    sa.ForeignKeyConstraint(['partner_id'], ['partners.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index('ix_places_ambiance_slugs', 'places', ['ambiance_slugs'], unique=False, postgresql_using='gin')
    op.create_index('ix_places_category_slugs', 'places', ['category_slugs'], unique=False, postgresql_using='gin')
    op.create_index('ix_places_city_status_tier', 'places', ['city_id', 'status', 'tier'], unique=False)
    op.create_geospatial_index('ix_places_location', 'places', ['location'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_index('ix_places_name_trgm', 'places', ['name'], unique=False, postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.create_index('ix_places_search_vector', 'places', ['search_vector'], unique=False, postgresql_using='gin')
    op.create_table('search_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('query', sa.String(length=200), nullable=True),
    sa.Column('filters', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('approx_lat', sa.Float(), nullable=True),
    sa.Column('approx_lng', sa.Float(), nullable=True),
    sa.Column('result_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_search_history_created', 'search_history', ['created_at'], unique=False)
    op.create_index('ix_search_history_user', 'search_history', ['user_id', 'created_at'], unique=False)
    op.create_table('subscriptions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('plan_code', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('provider_ref', sa.String(length=120), nullable=True),
    sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True),
    sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['plan_code'], ['plans.code'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_subscriptions_user', 'subscriptions', ['user_id', 'status'], unique=False)
    op.create_table('user_preferences',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('categories', sa.ARRAY(sa.String(length=64)), nullable=False),
    sa.Column('ambiances', sa.ARRAY(sa.String(length=64)), nullable=False),
    sa.Column('budget_max_fcfa', sa.Integer(), nullable=True),
    sa.Column('home_city', sa.String(length=64), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('collection_items',
    sa.Column('collection_id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['collection_id'], ['collections.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('collection_id', 'place_id')
    )
    op.create_table('curation_items',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('reason', sa.String(length=40), nullable=False),
    sa.Column('detail', sa.String(length=500), nullable=False),
    sa.Column('proposed_by', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('decided_by', sa.UUID(), nullable=True),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status in ('pending','approved','rejected')"),
    sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['proposed_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_curation_status', 'curation_items', ['status', 'created_at'], unique=False)
    op.create_table('events',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('price_fcfa', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_place_start', 'events', ['place_id', 'starts_at'], unique=False)
    op.create_table('favorites',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'place_id')
    )
    op.create_table('itinerary_steps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('itinerary_id', sa.UUID(), nullable=False),
    sa.Column('position', sa.SmallInteger(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=True),
    sa.Column('note', sa.String(length=280), nullable=True),
    sa.ForeignKeyConstraint(['itinerary_id'], ['itineraries.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('itinerary_id', 'position')
    )
    op.create_table('media',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('storage_key', sa.String(length=255), nullable=True),
    sa.Column('gradient', sa.ARRAY(sa.String(length=9)), nullable=False),
    sa.Column('alt', sa.String(length=255), nullable=False),
    sa.Column('credit', sa.String(length=160), nullable=True),
    sa.Column('license', sa.String(length=80), nullable=True),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('position', sa.SmallInteger(), nullable=False),
    sa.Column('moderation_status', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_media_place', 'media', ['place_id', 'position'], unique=False)
    op.create_table('opening_exceptions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('closed', sa.Boolean(), nullable=False),
    sa.Column('opens', sa.Time(), nullable=True),
    sa.Column('closes', sa.Time(), nullable=True),
    sa.Column('note', sa.String(length=255), nullable=True),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('place_id', 'day')
    )
    op.create_table('opening_hours',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('weekday', sa.SmallInteger(), nullable=False),
    sa.Column('opens', sa.Time(), nullable=False),
    sa.Column('closes', sa.Time(), nullable=False),
    sa.CheckConstraint('weekday between 0 and 6'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_opening_hours_place_day', 'opening_hours', ['place_id', 'weekday'], unique=False)
    op.create_table('payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('subscription_id', sa.UUID(), nullable=True),
    sa.Column('amount_fcfa', sa.Integer(), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('provider_ref', sa.String(length=120), nullable=False),
    sa.Column('method', sa.String(length=32), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('provider', 'provider_ref')
    )
    op.create_index('ix_payments_user', 'payments', ['user_id', 'created_at'], unique=False)
    op.create_table('place_ambiances',
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('ambiance_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['ambiance_id'], ['ambiances.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('place_id', 'ambiance_id')
    )
    op.create_index('ix_place_ambiances_ambiance', 'place_ambiances', ['ambiance_id'], unique=False)
    op.create_table('place_categories',
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('place_id', 'category_id')
    )
    op.create_index('ix_place_categories_category', 'place_categories', ['category_id'], unique=False)
    op.create_table('place_tags',
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('tag_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('place_id', 'tag_id')
    )
    op.create_table('reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('resolved_by', sa.UUID(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind in ('closed','wrong_hours','wrong_location','wrong_price','other')"),
    sa.CheckConstraint("status in ('open','resolved','rejected')"),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reports_status_created', 'reports', ['status', 'created_at'], unique=False)
    op.create_table('reviews',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('place_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('rating', sa.SmallInteger(), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=12), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('rating between 1 and 5'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('place_id', 'user_id')
    )
    op.create_index('ix_reviews_place_created', 'reviews', ['place_id', 'created_at'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('ix_reviews_place_created', table_name='reviews')
    op.drop_table('reviews')
    op.drop_index('ix_reports_status_created', table_name='reports')
    op.drop_table('reports')
    op.drop_table('place_tags')
    op.drop_index('ix_place_categories_category', table_name='place_categories')
    op.drop_table('place_categories')
    op.drop_index('ix_place_ambiances_ambiance', table_name='place_ambiances')
    op.drop_table('place_ambiances')
    op.drop_index('ix_payments_user', table_name='payments')
    op.drop_table('payments')
    op.drop_index('ix_opening_hours_place_day', table_name='opening_hours')
    op.drop_table('opening_hours')
    op.drop_table('opening_exceptions')
    op.drop_index('ix_media_place', table_name='media')
    op.drop_table('media')
    op.drop_table('itinerary_steps')
    op.drop_table('favorites')
    op.drop_index('ix_events_place_start', table_name='events')
    op.drop_table('events')
    op.drop_index('ix_curation_status', table_name='curation_items')
    op.drop_table('curation_items')
    op.drop_table('collection_items')
    op.drop_table('user_preferences')
    op.drop_index('ix_subscriptions_user', table_name='subscriptions')
    op.drop_table('subscriptions')
    op.drop_index('ix_search_history_user', table_name='search_history')
    op.drop_index('ix_search_history_created', table_name='search_history')
    op.drop_table('search_history')
    op.drop_index('ix_places_search_vector', table_name='places', postgresql_using='gin')
    op.drop_index('ix_places_name_trgm', table_name='places', postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.drop_geospatial_index('ix_places_location', table_name='places', postgresql_using='gist', column_name='location')
    op.drop_index('ix_places_city_status_tier', table_name='places')
    op.drop_index('ix_places_category_slugs', table_name='places', postgresql_using='gin')
    op.drop_index('ix_places_ambiance_slugs', table_name='places', postgresql_using='gin')
    op.drop_geospatial_table('places')
    op.drop_index('ix_itineraries_user', table_name='itineraries')
    op.drop_table('itineraries')
    op.drop_table('concierge_usage')
    op.drop_index('ix_collections_user', table_name='collections')
    op.drop_table('collections')
    op.drop_index('ix_audit_entity', table_name='audit_log')
    op.drop_index('ix_audit_created', table_name='audit_log')
    op.drop_table('audit_log')
    op.drop_index('ix_users_email_lower', table_name='users')
    op.drop_table('users')
    op.drop_geospatial_index('idx_districts_center', table_name='districts', postgresql_using='gist', column_name='center')
    op.drop_geospatial_table('districts')
    op.drop_table('tags')
    op.drop_table('plans')
    op.drop_table('partners')
    op.drop_table('data_sources')
    op.drop_geospatial_index('idx_cities_center', table_name='cities', postgresql_using='gist', column_name='center')
    op.drop_geospatial_table('cities')
    op.drop_table('categories')
    op.drop_table('ambiances')
    # ### end Alembic commands ###
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
