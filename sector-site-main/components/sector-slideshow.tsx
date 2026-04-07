"use client";
import React, { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import {EffectFade, Autoplay} from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';

interface SlideshowProps {
  images?: string[];
  duration?: number; // duration each slide is shown in milliseconds
  transitionDuration?: number; // duration of the transition effect in milliseconds
}

export default function Slideshow(){

   return (
    <div className="relative w-full"> {/* relative parent */}
      {/* Caption overlay */}
      <div className="absolute px-4 bottom-5 text-left z-20 flex items-left justify-center pointer-events-none">
        <h2 className="p-0.5 flex flex-col justify-end items-start static z-50 text-white text-shadow-xl font-akzid">
          Sector.FM is live and direct, Sunday and Wednesday from 9AM to 9PM.
        </h2>
      </div>
    <Swiper
      modules={[EffectFade, Autoplay]}
      effect="fade"
      autoplay={{ delay: 4000, disableOnInteraction: false }}
      speed={700}
      loop={true}
      spaceBetween={50}
      slidesPerView={1}
      onSlideChange={() => console.log('slide change')}
      onSwiper={(swiper) => console.log(swiper)}
      className="max-h-[700px]"
    >
      <SwiperSlide ><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776845/original_02b4a58dab166a9fe918edfa1da8dbf7.jpg?1755132002?bc=0" alt="" /></SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776838/original_5ed6e4dc036b60a9ade1b66641df0359.jpg?1755131995?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776836/original_5685a3d9925a609ee3b43cd78ced8966.jpg?1755131994?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776851/original_fd35dfda342af43301f86834c4b938f8.jpg?1755132004?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776821/original_89daa19936ffd7507d78dc4f9e824310.jpg?1755131973?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776807/original_870ad3d96454a977dccf8a8ca805d73e.jpg?1755131958?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776779/original_d665c3d44beaacca38b908800dc1b01f.jpg?1755131887?bc=0" alt="" /> </SwiperSlide>
      <SwiperSlide><img src="https://d2w9rnfcy7mm78.cloudfront.net/38776780/original_7f46f2acdb2de1eb2d60727e1965d895.jpg?1755131888?bc=0" alt="" /> </SwiperSlide>
    </Swiper>
    </div>
  );
};
