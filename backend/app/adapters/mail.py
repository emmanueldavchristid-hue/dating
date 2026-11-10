"""Envoi d'e-mails transactionnels. Sans service configuré, rien n'est envoyé (et l'API le dit)."""

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger(__name__)


def delivery_mode() -> str:
    s = get_settings()
    return "email" if s.mail_provider == "smtp" and s.smtp_host else "none"


def send(to: str, subject: str, text: str) -> bool:
    s = get_settings()
    if delivery_mode() != "email":
        if s.environment == "development":
            log.warning("E-mail NON envoyé (aucun service configuré) à %s : %s — %s", to, subject, text)
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.mail_from, to, subject
    msg.set_content(text)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.error("Envoi d'e-mail impossible : %s", type(e).__name__)
        return False
