from app.config import Settings, supabase_headers
from app.gateway import SupabaseGateway


def test_opaque_secret_key_is_not_sent_as_a_bearer_jwt():
    assert supabase_headers('sb_secret_fixture') == {'apikey': 'sb_secret_fixture'}


def test_signed_in_gateway_keeps_user_jwt_with_publishable_key():
    gateway = SupabaseGateway(Settings(supabase_publishable_key='sb_publishable_fixture',
        supabase_secret_key='sb_secret_fixture'), user_token='user.jwt.fixture')
    assert gateway._headers == {'apikey': 'sb_publishable_fixture',
        'Authorization': 'Bearer user.jwt.fixture', 'Content-Type': 'application/json'}


def test_legacy_service_role_jwt_remains_supported():
    assert supabase_headers('legacy.jwt.fixture') == {'apikey': 'legacy.jwt.fixture',
        'Authorization': 'Bearer legacy.jwt.fixture'}
