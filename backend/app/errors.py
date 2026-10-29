from fastapi import HTTPException


class ApiError(HTTPException):
    """Erreur au format du contrat : {detail, code}."""

    def __init__(self, status: int, code: str, detail: str):
        super().__init__(status_code=status, detail=detail)
        self.code = code


def not_found(what: str = "Ressource") -> ApiError:
    return ApiError(404, "not_found", f"{what} introuvable")


def forbidden(detail: str = "Accès refusé") -> ApiError:
    return ApiError(403, "forbidden", detail)


def premium_required(detail: str = "Contenu réservé aux membres premium") -> ApiError:
    return ApiError(403, "premium_required", detail)
