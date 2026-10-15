import numpy as np

from app.services.calibration import otsu_threshold


def test_otsu_finds_valley_between_strangers_and_same_person():
    rng = np.random.default_rng(0)
    strangers = rng.normal(0.18, 0.06, 4000)
    same_person = rng.normal(0.68, 0.07, 1500)
    t = otsu_threshold(np.clip(np.concatenate([strangers, same_person]), 0, 1))
    assert 0.33 < t < 0.5


def test_otsu_empty_is_nan():
    assert np.isnan(otsu_threshold(np.array([])))


def test_valley_is_between_unequal_humps():
    from app.services.calibration import valley_threshold

    rng = np.random.default_rng(1)
    strangers = rng.normal(0.06, 0.07, 3000)
    same_person = rng.normal(0.85, 0.09, 1500)
    t = valley_threshold(np.clip(np.concatenate([strangers, same_person]), 0, 1))
    assert 0.3 < t < 0.55
