from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class IPAddress(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(15), unique=True, nullable=False)
    hostname = db.Column(db.String(255)) # Nom que l'utilisateur associe
    is_up = db.Column(db.Boolean, default=False)
    last_scanned = db.Column(db.DateTime, default=db.func.now())

    def __repr__(self):
        return f'<IPAddress {self.ip} - {self.hostname}>'