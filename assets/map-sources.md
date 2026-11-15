# 地理数据来源

- 中国省级地理数据：阿里云 DataV.GeoAtlas，https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json 。从官方 https://datav.aliyun.com/portal/school/atlas/area_selector 获取，保留省级范围与岛屿，按个人相册概览用途简化。
- 周边陆地轮廓：Natural Earth 1:50m Land，https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson 。Public domain，https://www.naturalearthdata.com/about/terms-of-use/ 。裁剪到亚洲区域后简化。
- 浏览时无需访问上述服务，使用随网站提供的 `geography.js`。地图用于回忆地点展示，不用于导航或精确测量。

市、区县边界与标签来自 DataV.GeoAtlas：浙江、江苏、广东、新疆的市级边界，以及照片涉及的 17 个市州的区县边界。原始入口为 https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json ，本地简化后随站点提供（2026-11-15）。
