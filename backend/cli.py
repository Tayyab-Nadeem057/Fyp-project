"""Quick command-line check for Python packages (PyPI):
    python cli.py requests reqeusts totally-fake-pkg
    python cli.py pypi requests reqeusts
"""
import sys

from app import service


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    args = sys.argv[1:]
    if args[0].lower() == "pypi":
        eco = "pypi"
        names = args[1:]
    elif args[0].lower() == "npm":
        print("Error: DepGuard has been updated to support Python (PyPI) packages only. npm is no longer supported.")
        return 1
    else:
        eco = "pypi"
        names = args

    if not names:
        print("Error: Please provide at least one package name to check.")
        return 1

    for r in service.analyze_many(eco, names, project="cli"):
        print(f"[{r['risk_level'].upper():10}] {r['name']}  (score {r['score']})")
        for reason in r["reasons"]:
            print(f"    - {reason['text']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
