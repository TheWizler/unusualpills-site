from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/claw")
def claw():
    return render_template("claw.html")

@app.route("/merch")
def merch():
    return render_template("merch.html")

if __name__ == "__main__":
    app.run(debug=True)
