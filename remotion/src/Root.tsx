import React from 'react';
import {Composition} from 'remotion';
import {PitchVideo} from './PitchVideo';
import scenes from './scenes.json';
const durationInFrames=scenes.reduce((sum,s)=>sum+s.frames,0);
export const RemotionRoot:React.FC=()=> <Composition id="allma-pitch" component={PitchVideo} durationInFrames={durationInFrames} fps={30} width={1920} height={1080}/>;
