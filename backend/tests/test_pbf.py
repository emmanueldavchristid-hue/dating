import osmium

from app.importers.pbf import read_pbf, within


def test_read_pbf_nodes_and_ways(tmp_path):
    path = str(tmp_path / "mini.osm.pbf")
    w = osmium.SimpleWriter(path)
    w.add_node(osmium.osm.mutable.Node(id=1, location=(-4.02, 5.33), tags={"amenity": "bar", "name": "Bar PBF"}))
    w.add_node(osmium.osm.mutable.Node(id=2, location=(-4.0, 5.30), tags={"amenity": "bench"}))
    for i, (lon, lat) in enumerate([(-3.99, 5.30), (-3.98, 5.30), (-3.98, 5.31)], start=10):
        w.add_node(osmium.osm.mutable.Node(id=i, location=(lon, lat)))
    w.add_way(osmium.osm.mutable.Way(id=5, nodes=[10, 11, 12], tags={"leisure": "park", "name": "Parc PBF"}))
    w.add_node(osmium.osm.mutable.Node(id=3, location=(-5.0, 7.0), tags={"amenity": "cafe", "name": "Café lointain"}))
    w.close()
    els = read_pbf(path)
    assert {e["tags"]["name"] for e in els} == {"Bar PBF", "Parc PBF", "Café lointain"}
    park = next(e for e in els if e["type"] == "way")
    assert abs(park["center"]["lat"] - 5.3033) < 0.01
    near = within(els, 5.3364, -4.0267, 25)
    assert {e["tags"]["name"] for e in near} == {"Bar PBF", "Parc PBF"}
