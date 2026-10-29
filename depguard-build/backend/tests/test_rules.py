import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import db, rules, service  # noqa: E402

NOW = datetime(2026, 10, 11, tzinfo=timezone.utc)


def pkg(**kw):
    base = dict(exists=True, ecosystem="npm", name="some-pkg", created=NOW - timedelta(days=900),
                version_count=20, weekly_downloads=50000, maintainer_count=2,
                has_repository=True, has_readme=True, has_license=True, install_scripts=[])
    base.update(kw)
    return base


class RuleTests(unittest.TestCase):
    def test_nonexistent_is_dangerous(self):
        r = rules.evaluate({"exists": False, "ecosystem": "pypi", "name": "flask-ultra-auth-helper"}, NOW)
        self.assertEqual(r["risk_level"], "dangerous")
        self.assertEqual(r["reasons"][0]["code"], "NOT_FOUND")

    def test_nonexistent_typo_suggests_real_package(self):
        r = rules.evaluate({"exists": False, "ecosystem": "pypi", "name": "reqeusts"}, NOW)
        self.assertTrue(any(x["code"] == "DID_YOU_MEAN" and "requests" in x["text"] for x in r["reasons"]))

    def test_healthy_package_is_safe(self):
        r = rules.evaluate(pkg(name="left-padder-utils"), NOW)
        self.assertEqual(r["risk_level"], "safe")

    def test_popular_package_itself_not_flagged_as_typosquat(self):
        r = rules.evaluate(pkg(name="express"), NOW)
        self.assertFalse(any(x["code"] == "TYPOSQUAT" for x in r["reasons"]))

    def test_typosquat_new_with_install_script_is_dangerous(self):
        r = rules.evaluate(pkg(name="expresss", created=NOW - timedelta(days=2), weekly_downloads=12,
                               install_scripts=["postinstall"], version_count=1), NOW)
        self.assertEqual(r["risk_level"], "dangerous")
        codes = {x["code"] for x in r["reasons"]}
        self.assertTrue({"TYPOSQUAT", "VERY_NEW", "INSTALL_SCRIPT"} <= codes)

    def test_score_capped_at_100(self):
        r = rules.evaluate(pkg(name="expresss", created=NOW - timedelta(days=1), weekly_downloads=0,
                               install_scripts=["install"], has_repository=False, has_readme=False,
                               has_license=False, version_count=1), NOW)
        self.assertEqual(r["score"], 100)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.path = os.path.join(self.tmp, "t.db")
        db.DB_PATH = self.path
        service._CACHE.clear()

    def test_analyze_saves_history_and_summary(self):
        fake = lambda eco, name: {"exists": False, "ecosystem": eco, "name": name}
        service.analyze("pypi", "totally-fake-lib", "demo", fetcher=fake)
        h = db.history(path=self.path)
        self.assertEqual(len(h), 1)
        self.assertEqual(h[0]["risk_level"], "dangerous")
        self.assertEqual(db.summary(path=self.path)["dangerous"], 1)

    def test_analyze_many_dedupes_and_survives_registry_errors(self):
        from app.registry import RegistryError

        def flaky(eco, name):
            if name == "boom":
                raise RegistryError("down")
            return {"exists": False, "ecosystem": eco, "name": name}

        out = service.analyze_many("npm", ["a-fake", "a-fake", "boom"], fetcher=flaky)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[1]["risk_level"], "unknown")


if __name__ == "__main__":
    unittest.main()
