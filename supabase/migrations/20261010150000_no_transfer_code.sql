-- Moving to another device is done with an email account now, so transfer codes are switched off.
drop function if exists public.redeem_code(text);
